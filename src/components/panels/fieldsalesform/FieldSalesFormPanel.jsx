import { useEffect, useState } from 'react'
import { useLeadCaptureAccess } from '../../../context/LeadCaptureAccessContext'
import { fetchFieldSalesOptions } from '../../../lib/fieldSalesForm'
import { canAccessFieldSalesForm, canCreateFieldSalesForm, canDeleteFieldSales, canDeletePushedFieldSales, canManageFieldSalesLists, canViewAllFieldSales } from '../../../lib/fieldSalesFormPermissions'
import FieldSalesEntriesTable from './FieldSalesEntriesTable'

// Field Sales Form (post-migration, not a port; a module of its own — see lib/fieldSalesForm.js for the data model and
// lib/fieldSalesFormPermissions.js for the keys). One of the two tabs of Lead Capture (LeadCapturePanel, which owns the page
// title, breadcrumb and padding — this renders without any). A thin wrapper: it gates access, loads the four pick-lists the
// New Entry form's chips, the table's filters and the manage popover share, and shows the entries table — the tab lands
// straight on it; "New Entry" is a button in the table's toolbar that opens the form in a modal (no inner tabs).
export default function FieldSalesFormPanel() {
  const { permissions } = useLeadCaptureAccess()
  const canView = canAccessFieldSalesForm(permissions)
  const canCreate = canCreateFieldSalesForm(permissions)
  const viewAll = canViewAllFieldSales(permissions)
  const canManage = canManageFieldSalesLists(permissions)
  const canDelete = canDeleteFieldSales(permissions)
  const canDeletePushed = canDeletePushedFieldSales(permissions)

  // The pick-lists: null while loading. Only fetched for someone who will use them (typing an entry, or a view_all user's
  // filters) — a view-only user never needs them.
  const [lists, setLists] = useState(null)
  const [listsError, setListsError] = useState('')
  const needsLists = canView && (canCreate || viewAll)

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

  // After the manage popover (or a failed first load's Retry) changed or re-asked for the lists. Never rejects.
  function refreshLists() {
    setListsError('')
    return fetchFieldSalesOptions({ force: true })
      .then(setLists)
      .catch((e) => setListsError(e.message))
  }

  return <FieldSalesEntriesTable admin={viewAll} canDelete={canDelete} canDeletePushed={canDeletePushed} canCreate={canCreate} canManage={canManage} lists={lists} listsError={listsError} onListsChanged={refreshLists} />
}
