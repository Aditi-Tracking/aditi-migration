import { useEffect, useMemo, useState } from 'react'
import OverlayShell from '../../shared/OverlayShell'
import { fetchAllUploads } from '../../../lib/taskChecklist'

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

// Ported from old-portal/js/tasks.js's tShowAllUploads/tFetchAndRenderUploads —
// owner/MIS/canViewUploads-only. Defaults both date fields to today, same
// as production.
export default function TaskUploadsViewerModal({ open, onClose }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [files, setFiles] = useState([])
  const [search, setSearch] = useState('')
  const [nameFilter, setNameFilter] = useState('')
  const [dateFrom, setDateFrom] = useState(todayISO())
  const [dateTo, setDateTo] = useState(todayISO())

  function load(df, dt) {
    setLoading(true)
    setError('')
    fetchAllUploads({ dateFrom: df, dateTo: dt })
      .then(setFiles)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (!open) return
    const t = todayISO()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset filters fresh each time the modal opens
    setSearch('')
    setNameFilter('')
    setDateFrom(t)
    setDateTo(t)
    load(t, t)
  }, [open])

  function handleReset() {
    setSearch('')
    setNameFilter('')
    setDateFrom('')
    setDateTo('')
    load('', '')
  }

  function handleDateChange(setter, df, dt) {
    setter(df)
    load(df, dt)
  }

  const employeeOptions = useMemo(() => [...new Set(files.map((f) => f.employee).filter(Boolean))].sort(), [files])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return files.filter((f) => {
      if (q && !(f.employee.toLowerCase().includes(q) || f.task.toLowerCase().includes(q) || f.dept.toLowerCase().includes(q) || f.fileName.toLowerCase().includes(q))) return false
      if (nameFilter && f.employee !== nameFilter) return false
      return true
    })
  }, [files, search, nameFilter])

  if (!open) return null

  return (
    <OverlayShell open={open} onClose={onClose} maxWidth="max-w-2xl">
      <div className="text-[15px] font-semibold text-text mb-3 pr-8">📁 Uploaded Files</div>

      <div className="flex flex-wrap gap-2 mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Search employee, task, file..."
          className="flex-1 min-w-[160px] rounded-md border border-border bg-surface-2 px-3 py-1.5 text-[12.5px] text-text outline-none"
        />
        <select
          value={nameFilter}
          onChange={(e) => setNameFilter(e.target.value)}
          className="rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-[12px] text-text outline-none"
        >
          <option value="">All Employees</option>
          {employeeOptions.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => handleDateChange(setDateFrom, e.target.value, dateTo)}
          className="rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-[12px] text-text outline-none"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => handleDateChange(setDateTo, dateFrom, e.target.value)}
          className="rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-[12px] text-text outline-none"
        />
        <button type="button" onClick={handleReset} className="text-[11.5px] text-text-muted border border-border rounded-md px-3 py-1.5">
          ↺ Reset
        </button>
      </div>

      {loading && <div className="text-center py-10 text-text-muted text-[12.5px]">⏳ Loading…</div>}
      {!loading && error && <div className="text-center py-10 text-danger text-[12.5px]">❌ {error}</div>}
      {!loading && !error && !filtered.length && (
        <div className="text-center py-10 text-text-muted text-[12.5px]">📭 No uploaded files found</div>
      )}

      {!loading && !error && !!filtered.length && (
        <div className="flex flex-col max-h-[50vh] overflow-y-auto">
          {filtered.map((f) => (
            <div key={f.taskId} className="flex items-center gap-3 py-2.5 border-b border-border last:border-b-0">
              <div className="w-9 h-9 rounded-lg bg-primary-tint border border-primary/20 flex items-center justify-center text-[16px] shrink-0">
                {f.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[12.5px] font-semibold text-text truncate" title={f.fileName}>
                  {f.fileName}
                </div>
                <div className="flex flex-wrap gap-1.5 mt-1 items-center">
                  <span className="text-[10.5px] bg-primary-tint text-primary border border-primary/20 rounded px-1.5 py-0.5">👤 {f.employee}</span>
                  <span className="text-[10.5px] text-text-muted">{f.dept}</span>
                </div>
                <div className="text-[11px] text-text-muted mt-0.5 truncate">📋 {f.task}</div>
              </div>
              <a
                href={f.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11.5px] font-semibold text-primary bg-primary-tint border border-primary/20 rounded-md px-3 py-1.5 shrink-0"
              >
                ⬇ View
              </a>
            </div>
          ))}
        </div>
      )}
    </OverlayShell>
  )
}
