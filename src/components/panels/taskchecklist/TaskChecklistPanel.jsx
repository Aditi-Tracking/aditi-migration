import { useEffect, useRef, useState } from 'react'
import TabButton from '../../shared/TabButton'
import { useAuth } from '../../../context/AuthContext'
import { fetchEmployeeId } from '../../../lib/employeeProfile'
import {
  canDeleteTasks,
  canSeeDateRange,
  canSeeLocationFilter,
  canViewUploads,
  computeKpiSummary,
  deleteTasks,
  fetchChecklistRows,
  getDateFiltered,
  getFiltered,
} from '../../../lib/taskChecklist'
import { canUseTaskScheduler } from '../../../lib/taskScheduler'
import TaskKpiGrid from './TaskKpiGrid'
import TaskCharts from './TaskCharts'
import TaskLeaderboard from './TaskLeaderboard'
import TaskFilterBar from './TaskFilterBar'
import TaskTable from './TaskTable'
import TaskUploadModal from './TaskUploadModal'
import TaskUploadsViewerModal from './TaskUploadsViewerModal'
import TaskSchedulerTab from './TaskSchedulerTab'

const PER_PAGE = 20

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

// Ported from old-portal/js/tasks.js — Phase 1 (core checklist view).
// Interim nav visibility for this phase only checks owner/scope==='all'
// (see navItems.js) — the full async "resolves to an employee_checklists
// record" reveal + live-sync loop is Phase 3.
export default function TaskChecklistPanel() {
  const { currentUser, permissions } = useAuth()
  const scope = permissions.checklist_scope === 'all' ? 'all' : 'own'
  const schedulerAllowed = canUseTaskScheduler(currentUser, permissions)
  const [activeTab, setActiveTab] = useState('checklist')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastSync, setLastSync] = useState(null)
  const [noTaskWarning, setNoTaskWarning] = useState('')
  const [empId, setEmpId] = useState(undefined) // undefined = not yet resolved
  const [allRows, setAllRows] = useState([])

  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState(todayISO())
  const [dateTo, setDateTo] = useState(todayISO())
  const [department, setDepartment] = useState(null)
  const [person, setPerson] = useState(null)
  const [freq, setFreq] = useState(null)
  const [location, setLocation] = useState(null)
  const [status, setStatus] = useState(null)
  const [activeKpi, setActiveKpi] = useState(null)
  const [page, setPage] = useState(1)
  const [selectedIds, setSelectedIds] = useState(new Set())

  const [uploadTarget, setUploadTarget] = useState(null) // { id, task } | null
  const [uploadsViewerOpen, setUploadsViewerOpen] = useState(false)

  const isFirstLoad = useRef(true)

  // Resolve the user's Emp_id once for 'own' scope — mirrors loadTasks'
  // Step 1, fails closed (no tasks, no warning suppressed) on no match.
  useEffect(() => {
    if (scope === 'all') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resolves once per session, gated on scope
      setEmpId(null)
      return
    }
    let cancelled = false
    fetchEmployeeId(currentUser?.email).then((id) => {
      if (cancelled) return
      setEmpId(id != null ? String(id) : null)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only needs to resolve once per session
  }, [])

  async function load(df, dt) {
    if (scope === 'own' && !empId) {
      setNoTaskWarning(`Login email: ${currentUser?.email || ''} — not found in Employee_details.`)
      setAllRows([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    setNoTaskWarning('')
    try {
      const rows = await fetchChecklistRows({ scope, empId, dateFrom: df, dateTo: dt })
      setAllRows(rows)
      setLastSync(new Date())
      if (scope === 'own' && !rows.length) {
        setNoTaskWarning(`No tasks found for this date range — employee_checklists has no record for this emp_id.`)
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // Debounced date-triggered refetch — matches tApply's 400ms debounce for
  // date changes specifically (every other filter is client-side only).
  useEffect(() => {
    if (empId === undefined) return // still resolving for 'own' scope
    if (isFirstLoad.current) {
      isFirstLoad.current = false
      load(dateFrom, dateTo)
      return
    }
    const timer = setTimeout(() => load(dateFrom, dateTo), 400)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load() intentionally only reacts to date/empId changes
  }, [dateFrom, dateTo, empId])

  async function handleRefresh() {
    const t = todayISO()
    setDateFrom(t)
    setDateTo(t)
    await load(t, t)
  }

  const dateFilters = { search, dateFrom, dateTo, department, person, freq, location }
  const dateFilteredRows = getDateFiltered(allRows, dateFilters)
  const filteredRows = getFiltered(allRows, { ...dateFilters, status })
  const kpiSummary = computeKpiSummary(dateFilteredRows, { dateFrom, dateTo })

  const chartData = filteredRows.length && (activeKpi || person || department || status || freq || location) ? filteredRows : dateFilteredRows

  function resetPage() {
    setPage(1)
  }

  // Clicking a KPI tile: 'done'/'pending'/'ongoing' also sets the Status
  // filter (one coupled toggle); 'all'/'emp'/'score' only toggle the tile
  // itself. Matches tKpiClick exactly.
  function handleKpiClick(id) {
    if (activeKpi === id) {
      setActiveKpi(null)
      setStatus(null)
    } else {
      setActiveKpi(id)
      if (id === 'done') setStatus('done')
      else if (id === 'pending') setStatus('pending')
      else if (id === 'ongoing') setStatus('ongoing')
      else setStatus(null)
    }
    resetPage()
  }

  // Chart clicks: person/dept toggle their own filter only; the status
  // donut also syncs activeKpi (matches tChartFilter exactly).
  function handleChartFilter(type, val) {
    if (type === 'person') setPerson((p) => (p === val ? null : val))
    else if (type === 'dept') setDepartment((d) => (d === val ? null : val))
    else if (type === 'status') {
      setStatus((s) => {
        const next = s === val ? null : val
        setActiveKpi(next || null)
        return next
      })
    }
    resetPage()
  }

  // Filter-bar dropdown/search changes are client-side only, except that
  // activeKpi is only cleared when Status is cleared via the dropdown —
  // setting Status to a non-empty value via the dropdown does NOT touch
  // activeKpi, matching tApply's asymmetric behavior exactly.
  function handleStatusSelect(val) {
    setStatus(val || null)
    if (!val) setActiveKpi(null)
    resetPage()
  }

  function handleFilterChange(setter) {
    return (val) => {
      setter(val || null)
      resetPage()
    }
  }

  async function handleDeleteSelected() {
    if (!canDeleteTasks(permissions)) {
      alert('❌ You do not have permission to delete tasks.')
      return
    }
    if (!selectedIds.size) return
    if (!confirm(`⚠️ Are you sure you want to delete ${selectedIds.size} task(s)? This cannot be undone.`)) return
    try {
      await deleteTasks([...selectedIds])
    } catch {
      /* fall through — reload regardless, matching production's best-effort reload after delete */
    }
    setSelectedIds(new Set())
    // Fix for old-portal's tFetchTasks() bug (calls a function that doesn't
    // exist — every bulk delete throws in production). Reload for real.
    await load(dateFrom, dateTo)
  }

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PER_PAGE))
  const pageRows = filteredRows.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  function afterMutation(updater) {
    setAllRows((prev) => prev.map(updater))
  }

  return (
    <div className="px-4 sm:px-6 py-5">
      <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
        <div>
          <div className="text-[16px] font-semibold text-text">Tasks</div>
          <div className="text-[11.5px] text-text-muted mt-0.5">Home › Task Checklist</div>
        </div>
        <div className="flex items-center gap-2">
          {lastSync && <span className="text-[11px] text-text-muted">Updated {lastSync.toLocaleTimeString()}</span>}
          {canViewUploads(currentUser) && (
            <button
              type="button"
              onClick={() => setUploadsViewerOpen(true)}
              className="text-[12px] font-medium text-primary border border-primary/30 rounded-md px-3 py-1.5"
            >
              📁 Uploaded Files
            </button>
          )}
          <button
            type="button"
            onClick={handleRefresh}
            disabled={loading}
            className="text-[12px] font-medium text-primary border border-primary/30 rounded-md px-3 py-1.5 disabled:opacity-60"
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Tab bar — only rendered for MIS/owner (or anyone individually
          granted can_use_task_scheduler), mirrors tRenderTabBar's own
          "no bar at all if there's nothing to switch" rule. */}
      {schedulerAllowed && (
        <div className="flex gap-1.5 flex-wrap mb-5">
          <TabButton active={activeTab === 'checklist'} onClick={() => setActiveTab('checklist')}>
            📋 Checklist
          </TabButton>
          <TabButton active={activeTab === 'scheduler'} onClick={() => setActiveTab('scheduler')}>
            🗓️ Task Scheduler
          </TabButton>
        </div>
      )}

      <div hidden={schedulerAllowed && activeTab !== 'checklist'}>
      {loading && <div className="text-center py-16 text-text-muted text-[13px]">⏳ Loading…</div>}
      {!loading && error && <div className="text-center py-16 text-danger text-[13px]">⚠️ {error}</div>}

      {!loading && !error && noTaskWarning && (
        <div className="rounded-xl border border-danger/25 bg-danger-tint text-danger text-[12.5px] px-4 py-3 my-4">
          ⚠️ No tasks found! {noTaskWarning}
        </div>
      )}

      {!loading && !error && (
        <div className="mt-5">
          <div className="text-[12px] font-semibold text-text-muted uppercase tracking-wide mb-2.5">
            Key Performance Indicators
          </div>
          <TaskKpiGrid summary={kpiSummary} activeKpi={activeKpi} onKpiClick={handleKpiClick} />

          <div className="text-[12px] font-semibold text-text-muted uppercase tracking-wide mt-6 mb-2.5">
            Task Analytics
          </div>
          <TaskCharts
            data={chartData}
            activePerson={person}
            activeDept={department}
            activeStatus={status}
            onChartFilter={handleChartFilter}
          />

          <div className="text-[12px] font-semibold text-text-muted uppercase tracking-wide mt-6 mb-2.5">
            Performance Leaderboard
          </div>
          <TaskLeaderboard data={chartData} activePerson={person} onRowClick={(name) => handleChartFilter('person', name)} />

          <div className="text-[12px] font-semibold text-text-muted uppercase tracking-wide mt-6 mb-2.5">
            Task Explorer
          </div>
          <TaskFilterBar
            search={search}
            onSearchChange={handleFilterChange(setSearch)}
            showDateRange={canSeeDateRange(currentUser)}
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDateFromChange={setDateFrom}
            onDateToChange={setDateTo}
            rows={allRows}
            department={department}
            onDepartmentChange={handleFilterChange(setDepartment)}
            person={person}
            onPersonChange={handleFilterChange(setPerson)}
            freq={freq}
            onFreqChange={handleFilterChange(setFreq)}
            showLocation={canSeeLocationFilter(currentUser)}
            location={location}
            onLocationChange={handleFilterChange(setLocation)}
            status={status}
            onStatusChange={handleStatusSelect}
          />

          <TaskTable
            rows={pageRows}
            total={filteredRows.length}
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            canDelete={canDeleteTasks(permissions)}
            currentUser={currentUser}
            selectedIds={selectedIds}
            onSelectedIdsChange={setSelectedIds}
            onDeleteSelected={handleDeleteSelected}
            afterMutation={afterMutation}
            onOpenUpload={(id, task) => setUploadTarget({ id, task })}
          />
        </div>
      )}
      </div>

      {schedulerAllowed && (
        <div hidden={activeTab !== 'scheduler'}>
          <TaskSchedulerTab onGenerated={() => load(dateFrom, dateTo)} />
        </div>
      )}

      <TaskUploadModal
        target={uploadTarget}
        onClose={() => setUploadTarget(null)}
        onUploaded={(id, url) => afterMutation((r) => (r.id === id ? { ...r, uploadUrl: url } : r))}
      />

      <TaskUploadsViewerModal open={uploadsViewerOpen} onClose={() => setUploadsViewerOpen(false)} />
    </div>
  )
}
