import { useEffect, useState } from 'react'
import { useLeadCaptureAccess } from '../../../context/LeadCaptureAccessContext'
import { fetchScotOutcomes } from '../../../lib/scot'
import { canAccessScot, canCreateScot, canDeleteScot, canManageScotDropdowns, canUpdateScot, canUploadScot, canViewAllScot } from '../../../lib/scotPermissions'
import ScotTable from './ScotTable'

// SCOT Calls — the fifth tab of Lead Capture (LeadCapturePanel owns the page title, breadcrumb and padding; this renders without any). A thin wrapper:
// it gates access, loads the managed call outcomes (only for someone who can use them — log a call or manage the list), and decides what the viewer may DO.
// The database enforces every right again; everything else lives in ScotTable. See lib/scot.js and sql/step19.
export default function ScotPanel() {
  const { permissions } = useLeadCaptureAccess()
  const canView = canAccessScot(permissions)
  const canUpdate = canUpdateScot(permissions)
  const canManage = canManageScotDropdowns(permissions)
  const [outcomes, setOutcomes] = useState(null)
  const [outcomesError, setOutcomesError] = useState('')
  const needsOutcomes = canView && (canUpdate || canManage)

  useEffect(() => {
    if (!needsOutcomes) return undefined
    let cancelled = false
    fetchScotOutcomes()
      .then((o) => !cancelled && setOutcomes(o))
      .catch((e) => !cancelled && setOutcomesError(e.message))
    return () => {
      cancelled = true
    }
  }, [needsOutcomes])

  if (!canView) {
    return <div className="px-4 sm:px-6 py-16 text-center text-text-muted text-[13px]">You don't have access to this dashboard.</div>
  }

  // After the Manage popover changed the list (or a failed first load's Retry). Never rejects.
  function refreshOutcomes() {
    setOutcomesError('')
    return fetchScotOutcomes({ force: true })
      .then(setOutcomes)
      .catch((e) => setOutcomesError(e.message))
  }

  return (
    <ScotTable
      canCreate={canCreateScot(permissions)}
      canUpload={canUploadScot(permissions)}
      canUpdate={canUpdate}
      canDelete={canDeleteScot(permissions)}
      canAdmin={canViewAllScot(permissions)}
      canManage={canManage}
      outcomes={outcomes}
      outcomesError={outcomesError}
      onOutcomesChanged={refreshOutcomes}
    />
  )
}
