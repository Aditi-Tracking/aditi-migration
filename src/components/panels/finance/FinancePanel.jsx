import { useAuth } from '../../../context/AuthContext'
import { canAccessVendorRequests } from '../../../lib/vendorRequests'
import CNSectionPanel from '../../shared/CNSectionPanel'
import DocCard from '../../shared/DocCard'

const PURCHASE_ICON = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
    <line x1="3" y1="6" x2="21" y2="6" />
    <path d="M16 10a4 4 0 01-8 0" />
  </svg>
)

// Ported from old-portal/js/app.js's loadSimpleCNPanel('finance', 'Finance')
// — plain content-nodes grid, same shape as Marketing/IT Admin/After Sales.
// The "Purchase Request" card (_injectPurchaseCard() in js/vendor.js, gated
// by vendor_access permission or MIS/owner role) is now built — see
// lib/vendorRequests.js and components/panels/vendorrequests/. It's
// injected via CNSectionPanel's extraCard slot, matching production's own
// insertBefore-at-the-front placement. Recurring Bills (a separate feature
// bundled in the same production file) is a future phase, not built here.
export default function FinancePanel({ onNavigate }) {
  const { currentUser, permissions } = useAuth()
  const showPurchaseCard = canAccessVendorRequests(currentUser, permissions)

  return (
    <CNSectionPanel
      sectionName="Finance"
      title="Finance"
      breadcrumb="Home › Finance"
      extraCard={
        showPurchaseCard ? (
          <DocCard
            icon={PURCHASE_ICON}
            name="Purchase Request"
            desc="Submit vendor payment requests, track approvals and manage purchase history."
            meta="💰 Vendor Payments"
            onClick={() => onNavigate?.('vendorrequests')}
          />
        ) : null
      }
    />
  )
}
