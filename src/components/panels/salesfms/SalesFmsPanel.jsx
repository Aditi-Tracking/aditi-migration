import { useEffect, useState } from 'react'
import { useLeadCaptureAccess } from '../../../context/LeadCaptureAccessContext'
import { canManageEnquiryDropdowns } from '../../../lib/enquiryPermissions'
import { fetchFmsReasons } from '../../../lib/salesFms'
import { canAccessSalesFms, canEditSalesFms, canUpdateSalesFms } from '../../../lib/salesFmsPermissions'
import SalesFmsTable from './SalesFmsTable'

// Sales FMS — the third tab of Lead Capture (LeadCapturePanel owns the page title, breadcrumb and padding; this renders without any). A thin
// wrapper: it gates access, loads the managed reason lists (only for someone who can use them — pick a reason, correct a stage or manage the
// lists), and decides what the viewer may DO: update (sales_fms_update: reasons, negotiation time, close), admin (sales_fms_edit AND
// enquiry_view_all: correct a stage, reopen) and manage (enquiry_manage_dropdowns: the reason lists). The database enforces all three again;
// everything else lives in SalesFmsTable. See lib/salesFms.js.
export default function SalesFmsPanel() {
  const { permissions } = useLeadCaptureAccess()
  const canView = canAccessSalesFms(permissions)
  const canUpdate = canUpdateSalesFms(permissions)
  const canAdmin = canEditSalesFms(permissions)
  const canManage = canManageEnquiryDropdowns(permissions)
  const [reasons, setReasons] = useState(null)
  const [reasonsError, setReasonsError] = useState('')
  const needsReasons = canView && (canUpdate || canAdmin || canManage)

  useEffect(() => {
    if (!needsReasons) return undefined
    let cancelled = false
    fetchFmsReasons()
      .then((r) => !cancelled && setReasons(r))
      .catch((e) => !cancelled && setReasonsError(e.message))
    return () => {
      cancelled = true
    }
  }, [needsReasons])

  if (!canView) {
    return <div className="px-4 sm:px-6 py-16 text-center text-text-muted text-[13px]">You don't have access to this dashboard.</div>
  }

  // After the Manage popover changed a list (or a failed first load's Retry). Never rejects.
  function refreshReasons() {
    setReasonsError('')
    return fetchFmsReasons({ force: true })
      .then(setReasons)
      .catch((e) => setReasonsError(e.message))
  }

  return <SalesFmsTable canUpdate={canUpdate} canAdmin={canAdmin} canManage={canManage} reasons={reasons} reasonsError={reasonsError} onReasonsChanged={refreshReasons} />
}
