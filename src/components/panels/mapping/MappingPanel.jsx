import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../../context/AuthContext'
import { canEditMapping, computeMappingKpis, fetchMappingData, filterAndSortMappingRows, getAllowedMappingRegions } from '../../../lib/customerMapping'
import MappingKpiCards from './MappingKpiCards'
import MappingRegionBar from './MappingRegionBar'
import MappingTable from './MappingTable'

// Ported from old-portal/js/mapping.js's loadMappingDashboard/mpLoadData/mpRenderTable. Nav
// visibility (`mappingPerm` in navItems.js) is a plain synchronous `can_view_mapping === 'true'`
// check — no NavContext/Provider, same category as crmPerm/hrEmployeePerm.
export default function MappingPanel() {
  const { currentUser, permissions } = useAuth()
  const canEdit = canEditMapping(permissions)
  const allowedRegions = useMemo(() => getAllowedMappingRegions(permissions), [permissions])

  const [region, setRegion] = useState('All')
  const [status, setStatus] = useState('all')
  const [gpsSearch, setGpsSearch] = useState('')
  const [odooSearch, setOdooSearch] = useState('')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refetches on every region switch, matching mpSwitchRegion
    setLoading(true)
    fetchMappingData(region).then((data) => {
      if (!cancelled) {
        setRows(data)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [region])

  const kpis = useMemo(() => computeMappingKpis(rows), [rows])
  const filteredRows = useMemo(
    () => filterAndSortMappingRows(rows, { status, gpsSearch, odooSearch }),
    [rows, status, gpsSearch, odooSearch]
  )

  // Merges a save/clear result into `rows` in place — keeps KPIs and the filtered table in sync
  // without a full refetch, matching production's own in-place _mpData/_mpFiltered patch.
  function handleRowSaved(gpsAliasId, patch) {
    setRows((prev) => prev.map((r) => (r.gps_alias_id === gpsAliasId ? { ...r, ...patch } : r)))
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4">
        <h1 className="text-[20px] font-bold text-text">🗺️ Customer Mapping</h1>
        <div className="text-[12px] text-text-muted mt-0.5">GPS Portal ↔ Odoo customer name mapping</div>
      </div>

      <MappingKpiCards kpis={kpis} status={status} onStatusClick={setStatus} />

      <div className="flex items-center gap-3 flex-wrap mb-4">
        <MappingRegionBar allowedRegions={allowedRegions} region={region} onRegionClick={setRegion} />
        <div className="w-px h-5 bg-border" />
        <input
          type="text"
          value={gpsSearch}
          onChange={(e) => setGpsSearch(e.target.value)}
          placeholder="🔍 Search GPS company..."
          className="text-[12.5px] rounded-md border border-border bg-surface px-3 py-1.5 min-w-[200px]"
        />
        <input
          type="text"
          value={odooSearch}
          onChange={(e) => setOdooSearch(e.target.value)}
          placeholder="🔍 Search Odoo customer..."
          className="text-[12.5px] rounded-md border border-border bg-surface px-3 py-1.5 min-w-[200px]"
        />
      </div>

      {loading ? (
        <div className="text-center py-10 text-text-muted text-[14px]">⏳ Loading customers...</div>
      ) : (
        <MappingTable rows={filteredRows} canEdit={canEdit} callerEmail={currentUser?.email} onRowSaved={handleRowSaved} />
      )}
    </div>
  )
}
