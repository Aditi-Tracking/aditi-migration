import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../../context/AuthContext'
import {
  applyMappingResult,
  buildDisplayRows,
  canEditMapping,
  clearMapping,
  computeMappingKpis,
  fetchMappingData,
  fetchMappingShared,
  filterAndSortMappingRows,
  getAllowedMappingRegions,
  isOptionInUse,
  mappingErrorMessage,
  saveMapping,
} from '../../../lib/customerMapping'
import MappingArchiveModal from './MappingArchiveModal'
import MappingConfirmDialog from './MappingConfirmDialog'
import MappingKpiCards from './MappingKpiCards'
import MappingRegionBar from './MappingRegionBar'
import MappingTable from './MappingTable'

// Ported from old-portal/js/mapping.js's loadMappingDashboard/mpLoadData/mpRenderTable. Nav
// visibility (`mappingPerm` in navItems.js) is a plain synchronous `can_view_mapping === 'true'`
// check — no NavContext/Provider, same category as crmPerm/hrEmployeePerm.
//
// `rows` holds GPS COMPANIES (one per customer_gps_aliases row); the table rows are derived from
// them by buildDisplayRows. All mutations (pick / unlink / unlink-all) live here so MappingTable
// and MappingOdooCell stay presentational and receive stable callbacks.
export default function MappingPanel() {
  const { permissions } = useAuth()
  const canEdit = canEditMapping(permissions)
  const allowedRegions = useMemo(() => getAllowedMappingRegions(permissions), [permissions])

  const [region, setRegion] = useState('All')
  const [status, setStatus] = useState('all')
  const [gpsSearch, setGpsSearch] = useState('')
  const [odooSearch, setOdooSearch] = useState('')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [addingFor, setAddingFor] = useState(null) // gps_alias_id with an open "pick another name" row
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [confirmDialog, setConfirmDialog] = useState(null) // see MappingConfirmDialog

  useEffect(() => {
    const ctrl = new AbortController()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refetches on every region switch, matching mpSwitchRegion
    setLoading(true)
    setLoadError('')
    setAddingFor(null)
    fetchMappingData(region, ctrl.signal)
      .then((data) => {
        setRows(data || [])
        setLoading(false)
      })
      .catch((e) => {
        if (e?.name === 'AbortError') return
        setRows([])
        setLoadError(mappingErrorMessage(e, 'Could not load customers'))
        setLoading(false)
      })
    return () => ctrl.abort()
  }, [region, reloadKey])

  const kpis = useMemo(() => computeMappingKpis(rows), [rows])
  const filteredRows = useMemo(
    () => filterAndSortMappingRows(rows, { status, gpsSearch, odooSearch }),
    [rows, status, gpsSearch, odooSearch]
  )
  const displayRows = useMemo(() => buildDisplayRows(filteredRows, addingFor), [filteredRows, addingFor])

  // Returns true on success so the picker knows whether to keep or reset its text.
  const handlePick = useCallback(async (company, option) => {
    // Only a name whose customer a GPS company really uses gets the "in use" confirm. A stale
    // link (customer nobody uses) is treated as free: the server re-links it to the right customer.
    if (isOptionInUse(option) && company.customer_id == null) {
      const ok = confirm(
        `"${option.odoo_name}" is already linked to customer "${option.in_use_by || 'another customer'}".\n\n` +
          `Link "${company.gps_name}" to that same customer?`
      )
      if (!ok) return false
    }
    try {
      const result = await saveMapping({ gpsAliasId: company.gps_alias_id, odooAliasId: option.id })
      setRows((prev) => applyMappingResult(prev, result))
      setAddingFor(null)
      return true
    } catch (e) {
      alert(mappingErrorMessage(e, 'Save failed'))
      return false
    }
  }, [])

  const runClear = useCallback(async (company, odooAliasId) => {
    try {
      const result = await clearMapping({ gpsAliasId: company.gps_alias_id, odooAliasId })
      setRows((prev) => applyMappingResult(prev, result))
      setAddingFor(null)
    } catch (e) {
      alert(mappingErrorMessage(e, 'Clear failed'))
    }
  }, [])

  // ✕ on a row. With 2+ Odoo names it unlinks just that name; with one (or a legacy row with no
  // Odoo alias) it clears the whole company, the same thing the old ✕ did.
  // Unlinking a NAME from a customer shared by several GPS companies removes it from all of them,
  // so that case asks through MappingConfirmDialog (lists the companies, default button Cancel).
  const handleUnlink = useCallback(
    async (company, link) => {
      const multi = link && (company.odoo_links || []).length > 1
      if (multi && company.shared_gps_count > 1) {
        let shared
        try {
          shared = await fetchMappingShared(company.gps_alias_id)
        } catch (e) {
          alert(mappingErrorMessage(e, 'Could not check which GPS companies share this customer'))
          return
        }
        setConfirmDialog({
          title: `Unlink "${link.odoo_name}"?`,
          message: 'This customer is shared. Unlinking this Odoo name removes it from every GPS company listed here:',
          names: [company.gps_name, ...(shared?.names || [])],
          more: shared?.more || 0,
          confirmLabel: 'Unlink',
          onConfirm: () => runClear(company, link.odoo_alias_id),
        })
        return
      }
      const msg = multi ? `Unlink "${link.odoo_name}" from "${company.gps_name}"?` : `Clear the mapping for "${company.gps_name}"?`
      if (!confirm(msg)) return
      await runClear(company, multi ? link.odoo_alias_id : undefined)
    },
    [runClear]
  )

  const handleClearAll = useCallback(
    async (company) => {
      const n = (company.odoo_links || []).length
      if (!confirm(`Unlink all ${n} Odoo names from "${company.gps_name}"?`)) return
      await runClear(company, undefined)
    },
    [runClear]
  )

  const handleAdd = useCallback((gpsAliasId) => setAddingFor(gpsAliasId), [])
  const handleCancelAdd = useCallback(() => setAddingFor(null), [])

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
        <button
          type="button"
          onClick={() => setArchiveOpen(true)}
          className="ml-auto text-[12px] font-semibold rounded-md px-2.5 py-1.5 border border-border bg-surface text-text-muted"
        >
          📦 Archived
        </button>
      </div>

      {loading ? (
        <div className="text-center py-10 text-text-muted text-[14px]">⏳ Loading customers...</div>
      ) : loadError ? (
        <div className="text-center py-10 text-[13px] text-danger">
          ⚠ {loadError}{' '}
          <button type="button" onClick={() => setReloadKey((k) => k + 1)} className="underline">
            Retry
          </button>
        </div>
      ) : (
        <MappingTable
          displayRows={displayRows}
          canEdit={canEdit}
          onPick={handlePick}
          onUnlink={handleUnlink}
          onAdd={handleAdd}
          onCancelAdd={handleCancelAdd}
          onClearAll={handleClearAll}
        />
      )}

      <MappingArchiveModal open={archiveOpen} onClose={() => setArchiveOpen(false)} />
      <MappingConfirmDialog dialog={confirmDialog} onClose={() => setConfirmDialog(null)} />
    </div>
  )
}
