import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../../context/AuthContext'
import {
  CRM_SERVERS,
  CRM_TIERS,
  canViewCrmChanges,
  fetchCrmDashboardData,
  getCrmAccessLevel,
  getCrmAllowedServers,
} from '../../../lib/crmVehicle'
import CustomerAlertsBanner from './CustomerAlertsBanner'
import CRMKpiCards from './CRMKpiCards'
import useVehicleChanges from './useVehicleChanges'
import CRMCustomerTable from './CRMCustomerTable'

// Bumped from production's 5 minutes to 10 — a modest, low-risk reduction in how often the
// ~3,938-row fetchAllPaginated burst fires. Deliberately not treated as the real fix for the
// reported lag — CRMCustomerTable's unbounded render at that row count (which this interval does
// nothing for, since it also fires on every manual server switch) is the stronger suspect,
// tracked as its own separate, to-be-profiled task rather than folded in here.
const REFRESH_MS = 10 * 60 * 1000

// Ported from old-portal/js/crm.js's loadCRMDashboard/crmApplyFilters/crmSwitchServer/
// crmSwitchTier/crmFilterStatus/crmSelectRow. Access level ('none'/'all'/'restricted'/a literal
// tier name) is resolved synchronously from `permissions` — no NavContext/Provider needed, unlike
// Renewals/Task Checklist/Task Delegation.
export default function CRMVehiclePanel() {
  const { currentUser, permissions } = useAuth()

  const accessLevel = useMemo(() => getCrmAccessLevel(currentUser, permissions), [currentUser, permissions])
  const allowedServers = useMemo(() => getCrmAllowedServers(currentUser, permissions), [currentUser, permissions])
  const canViewChanges = useMemo(() => canViewCrmChanges(currentUser, permissions), [currentUser, permissions])
  // A tier-name access level force-locks the tier filter and disables the tier buttons — see
  // MIGRATION-NOTES.md's tier-lock wrinkle. Only ever true for a non-super-admin whose
  // can_view_crm permission is itself a tier string, which nothing in Access Control's UI can
  // currently set.
  const lockedTier = accessLevel !== 'all' && accessLevel !== 'none' && accessLevel !== 'restricted' ? accessLevel : null

  const [server, setServer] = useState(() => {
    const allowed = getCrmAllowedServers(currentUser, permissions)
    if (allowed.includes('both')) return 'both'
    return allowed.find((s) => s !== 'both') || 'both'
  })
  const [tier, setTier] = useState(lockedTier || '')
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedRow, setSelectedRow] = useState(null)
  const [dataVersion, setDataVersion] = useState(0)
  const [deltas, setDeltas] = useState(null)
  const [totalDelta, setTotalDelta] = useState(null)
  const [page, setPage] = useState(1)

  const latestRef = useRef({ loaded: false, selectedRow: null })

  async function load() {
    setLoading(true)
    setError('')
    setSelectedRow(null)
    try {
      const { data: rows } = await fetchCrmDashboardData(server, currentUser, permissions)
      setData(rows)
      setDataVersion((v) => v + 1)
      latestRef.current.loaded = true
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (accessLevel === 'none') return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reloads on server switch only, matching crmSwitchServer
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reloads on server switch only, matching crmSwitchServer
  }, [server, accessLevel])

  useEffect(() => {
    latestRef.current.selectedRow = selectedRow
  }, [selectedRow])

  // 5-minute auto-refresh — only while data has loaded at least once and no row is selected,
  // matching production's setInterval guard exactly. A single interval for the panel's lifetime,
  // reading the latest state via a ref so it never fires with stale closures.
  useEffect(() => {
    const id = setInterval(() => {
      if (latestRef.current.loaded && !latestRef.current.selectedRow) load()
    }, REFRESH_MS)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one interval for the panel's lifetime; load() always reads current server via closure over state setters
  }, [server])

  function handleSwitchServer(s) {
    setServer(s)
  }

  function handleSwitchTier(t) {
    if (lockedTier) return
    setTier(t)
    // Deliberately does NOT clear the selected row or reload Vehicle Changes — matches
    // crmSwitchTier exactly (only crmFilterStatus and a server switch clear selection).
  }

  function handleStatusClick(s) {
    setStatus((prev) => (prev === s ? '' : s))
    setSelectedRow(null)
  }

  const filteredRows = useMemo(() => {
    const q = search.toLowerCase()
    let rows = data.filter((r) => (!q || (r.company || '').toLowerCase().includes(q)) && (!tier || r.tier === tier))
    if (status) {
      const km = { RUNNING: 'running_count', IDLE: 'idle_count', STOP: 'stop_count', INACTIVE: 'inactive_count' }
      rows = rows.filter((r) => (r[km[status]] || 0) > 0)
    }
    return rows
  }, [data, search, tier, status])

  // Jump back to page 1 whenever the filtered set changes composition (search/tier/status/a fresh
  // load), matching SmartFleetPanel's identical page-reset convention — otherwise a narrower
  // filter could leave `page` pointing past the new last page.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets pagination on filter change, not a render loop
    setPage(1)
  }, [data, search, tier, status])

  const aggregate = useMemo(() => {
    const tot = filteredRows.reduce((s, r) => s + (r.total_vehicles || 0), 0)
    const run = filteredRows.reduce((s, r) => s + (r.running_count || 0), 0)
    const idl = filteredRows.reduce((s, r) => s + (r.idle_count || 0), 0)
    const stp = filteredRows.reduce((s, r) => s + (r.stop_count || 0), 0)
    const ina = filteredRows.reduce((s, r) => s + (r.inactive_count || 0), 0)
    return { customers: filteredRows.length, total: tot, running: run, idle: idl, stop: stp, inactive: ina }
  }, [filteredRows])

  // Called unconditionally (hooks can't be conditional) — `enabled: canViewChanges` is this
  // hook's own internal replacement for the old `canViewChanges && <VehicleChangesSection/>`
  // gating, so a viewer without this permission still never triggers these fetches at all.
  const vehicleChanges = useVehicleChanges({
    enabled: canViewChanges,
    server,
    tier,
    allowedServers,
    totalVehicles: aggregate.total,
    dataVersion,
    selectedRow,
    onDeltasComputed: (d, td) => {
      setDeltas(d)
      setTotalDelta(td)
    },
  })

  if (accessLevel === 'none') {
    // Defensive fallback only — the nav item/hub tile are already hidden for this case.
    return <div className="px-4 sm:px-6 py-16 text-center text-text-muted text-[13px]">You don't have access to this dashboard.</div>
  }

  return (
    <div className="px-4 sm:px-6 py-5">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div>
          <div className="text-[16px] font-semibold text-text">
            CRM Vehicle <span className="text-[10.5px] font-normal text-text-muted tracking-wide">LIVE TRACKING</span>
          </div>
          <div className="text-[11.5px] text-text-muted mt-0.5">Home › Dashboards › CRM Vehicle</div>
        </div>
        {accessLevel === 'all' && (
          <span className="text-[11px] font-semibold text-primary bg-primary-tint border border-primary/25 rounded-full px-3 py-1">
            ✅ Full Access
          </span>
        )}
        {accessLevel === 'restricted' && (
          <span className="text-[11px] font-semibold text-primary bg-primary-tint border border-primary/25 rounded-full px-3 py-1">
            🔒 Server Restricted
          </span>
        )}
        {lockedTier && (
          <span className="text-[11px] font-semibold text-primary bg-primary-tint border border-primary/25 rounded-full px-3 py-1">
            🔒 {lockedTier} Only
          </span>
        )}
      </div>

      {/* Server + Tier filter rows, side by side — a plain top-to-bottom flow (Server/Tier -> KPI
          grid -> Vehicle Changes -> table). This undoes the earlier "reclaim right-side space"
          restructuring that put Vehicle Changes' filter bar in this row instead. */}
      <div className="flex gap-4 flex-wrap mb-4">
        <div>
          <div className="text-[11px] font-bold text-text-muted uppercase tracking-wide mb-1.5">Server</div>
          <div className="flex gap-1.5 flex-wrap">
            {CRM_SERVERS.filter((s) => allowedServers.includes(s.key)).map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => handleSwitchServer(s.key)}
                className={`text-[12px] font-medium rounded-md px-3 py-1.5 border ${
                  server === s.key ? 'bg-primary text-white border-primary' : 'border-border text-text-muted'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-[11px] font-bold text-text-muted uppercase tracking-wide mb-1.5">Filter by Tier</div>
          <div className={`flex gap-1.5 flex-wrap ${lockedTier ? 'pointer-events-none' : ''}`}>
            {CRM_TIERS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => handleSwitchTier(t.key)}
                className={`text-[12px] font-medium rounded-md px-3 py-1.5 border ${
                  tier === t.key ? 'bg-primary text-white border-primary' : 'border-border text-text-muted'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading && <div className="text-center py-16 text-text-muted text-[13px]">⏳ Loading data...</div>}
      {!loading && error && <div className="text-center py-16 text-danger text-[13px]">Failed to load. {error}</div>}

      {!loading && !error && (
        <>
          <CustomerAlertsBanner currentUser={currentUser} />

          <CRMKpiCards
            aggregate={aggregate}
            selectedRow={selectedRow}
            tierLabel={tier}
            deltas={deltas}
            totalDelta={totalDelta}
            companyDelta={vehicleChanges.companyDelta}
            activeStatus={status}
            onStatusClick={handleStatusClick}
          />

          {canViewChanges && <div className="mb-4">{vehicleChanges.filterBar}</div>}

          {canViewChanges && vehicleChanges.body}

          <CRMCustomerTable
            rows={filteredRows}
            search={search}
            onSearchChange={setSearch}
            selectedRow={selectedRow}
            onSelectRow={setSelectedRow}
            page={page}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  )
}
