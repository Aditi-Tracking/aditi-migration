import { useEffect, useState } from 'react'
import { useLeadCaptureAccess } from '../../../context/LeadCaptureAccessContext'
import { fetchDropdownOptions } from '../../../lib/enquiries'
import { canAccessEnquiry, canCreateEnquiry, canViewAllEnquiries } from '../../../lib/enquiryPermissions'
import EnquirySheet from './EnquirySheet'

// Enquiry Capture Sheet (post-migration, not a port — see lib/enquiries.js for the data model and the
// permission rules). One of the two tabs of Lead Capture (LeadCapturePanel, which owns the page title, breadcrumb
// and padding — this renders without any). A thin wrapper: it gates access, loads the managed Source / Sales
// Person lists the sheet's dropdowns, filters and manage popover share, and renders the sheet. All the behaviour —
// inline editing, new rows, filters, Send to FMS, Bulk Upload — lives in EnquirySheet.
export default function EnquiryPanel() {
  const { permissions } = useLeadCaptureAccess()
  const canView = canAccessEnquiry(permissions)
  const canCreate = canCreateEnquiry(permissions)
  const admin = canViewAllEnquiries(permissions)

  // The managed lists: null while loading. Only fetched for someone who will use them (typing a row, editing
  // one, or an admin's filters / upload) — a view-only normal user never needs them.
  const [dropdowns, setDropdowns] = useState(null)
  const [dropdownsError, setDropdownsError] = useState('')
  const needsDropdowns = canView && (canCreate || admin)

  useEffect(() => {
    if (!needsDropdowns) return
    let cancelled = false
    fetchDropdownOptions()
      .then((d) => !cancelled && setDropdowns(d))
      .catch((e) => !cancelled && setDropdownsError(e.message))
    return () => {
      cancelled = true
    }
  }, [needsDropdowns])

  if (!canView) {
    return <div className="px-4 sm:px-6 py-16 text-center text-text-muted text-[13px]">You don't have access to this dashboard.</div>
  }

  // After the manage popover or an import changes a list (the lib already cleared its cache). Never rejects.
  function refreshDropdowns() {
    setDropdownsError('')
    return fetchDropdownOptions({ force: true })
      .then(setDropdowns)
      .catch((e) => setDropdownsError(e.message))
  }

  return <EnquirySheet admin={admin} canCreate={canCreate} dropdowns={dropdowns} dropdownsError={dropdownsError} onDropdownsChanged={refreshDropdowns} />
}
