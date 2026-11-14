import { useEffect, useState } from 'react'
import { useLeadCaptureAccess } from '../../../context/LeadCaptureAccessContext'
import { fetchFieldSalesOptions } from '../../../lib/fieldSalesForm'
import { fetchPainAreas } from '../../../lib/fieldSalesVisits'
import { canAccessFieldSalesForm, canCreateFieldSalesForm, canDeleteFieldSales, canDeletePushedFieldSales, canManageFieldSalesLists, canViewAllFieldSales } from '../../../lib/fieldSalesFormPermissions'
import FieldSalesEntriesTable from './FieldSalesEntriesTable'
import FieldSalesLeadsTable from './FieldSalesLeadsTable'
import { PRIMARY, TOOL } from './visitFormStyles'

// Field Sales Form (post-migration, not a port; a module of its own — see lib/fieldSalesVisits.js for the data model and lib/fieldSalesFormPermissions.js for the
// keys). One of the tabs of Lead Capture (LeadCapturePanel, which owns the page title, breadcrumb and padding — this renders without any). A thin wrapper: it gates
// access, loads the one managed list the Visit Form uses (Pain area) and shows the LEADS table — the tab lands straight on it; "New Visit" opens the form in a modal.
// The old entries (the frozen field_sales_entries table, 11 rows of history) stay reachable, read-only, under "Legacy entries": no New Entry button, nothing can be added to them.
// Both views stay mounted once opened (a hidden view keeps its place), and the legacy one is not even fetched until it is opened.
export default function FieldSalesFormPanel() {
  const { permissions } = useLeadCaptureAccess()
  const canView = canAccessFieldSalesForm(permissions)
  const canCreate = canCreateFieldSalesForm(permissions)
  const viewAll = canViewAllFieldSales(permissions)
  const canManage = canManageFieldSalesLists(permissions)
  const canDelete = canDeleteFieldSales(permissions)
  const canDeletePushed = canDeletePushedFieldSales(permissions)

  const [mode, setMode] = useState('leads') // 'leads' | 'legacy'
  const [legacySeen, setLegacySeen] = useState(false)

  // Pain area (the Visit Form's one managed list): null while loading. Only fetched for someone who will use it (logging a visit, or managing the list).
  const [painAreas, setPainAreas] = useState(null)
  const [painError, setPainError] = useState('')
  const needsPain = canView && (canCreate || canManage)
  useEffect(() => {
    if (!needsPain) return
    let cancelled = false
    fetchPainAreas()
      .then((l) => !cancelled && setPainAreas(l))
      .catch((e) => !cancelled && setPainError(e.message))
    return () => {
      cancelled = true
    }
  }, [needsPain])

  // The legacy entries' own pick-lists (their admin filters only) — fetched when that view is first opened.
  const [lists, setLists] = useState(null)
  const [listsError, setListsError] = useState('')
  const needsLists = canView && legacySeen && viewAll
  useEffect(() => {
    if (!needsLists) return
    let cancelled = false
    fetchFieldSalesOptions()
      .then((l) => !cancelled && setLists(l))
      .catch((e) => !cancelled && setListsError(e.message))
    return () => {
      cancelled = true
    }
  }, [needsLists])

  if (!canView) {
    return <div className="px-4 sm:px-6 py-16 text-center text-text-muted text-[13px]">You don't have access to this dashboard.</div>
  }

  // After the Pain area manager changed the list (or a failed first load's Retry). Never rejects.
  function refreshPain() {
    setPainError('')
    return fetchPainAreas({ force: true })
      .then(setPainAreas)
      .catch((e) => setPainError(e.message))
  }
  function refreshLists() {
    setListsError('')
    return fetchFieldSalesOptions({ force: true })
      .then(setLists)
      .catch((e) => setListsError(e.message))
  }
  function show(next) {
    setMode(next)
    if (next === 'legacy') setLegacySeen(true)
  }

  return (
    <div>
      <div role="group" aria-label="View" className="inline-flex gap-1.5 mb-3">
        <button type="button" aria-pressed={mode === 'leads'} onClick={() => show('leads')} className={`${TOOL} ${mode === 'leads' ? PRIMARY : ''}`} data-view="leads">
          Leads
        </button>
        <button type="button" aria-pressed={mode === 'legacy'} onClick={() => show('legacy')} className={`${TOOL} ${mode === 'legacy' ? PRIMARY : ''}`} data-view="legacy">
          Legacy entries
        </button>
      </div>

      <div hidden={mode !== 'leads'}>
        <FieldSalesLeadsTable admin={viewAll} canCreate={canCreate} canManage={canManage} painAreas={painAreas} painError={painError} onPainChanged={refreshPain} />
      </div>
      {legacySeen && (
        <div hidden={mode !== 'legacy'}>
          <div className="text-[12.5px] text-text-muted mb-3">The original Field Sales entries, kept as history. They are read-only: new visits are logged under Leads.</div>
          <FieldSalesEntriesTable admin={viewAll} canDelete={canDelete} canDeletePushed={canDeletePushed} canCreate={false} canManage={false} lists={lists} listsError={listsError} onListsChanged={refreshLists} />
        </div>
      )}
    </div>
  )
}
