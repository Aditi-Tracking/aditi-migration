import { useEffect, useState } from 'react'
import { useAuth } from '../../../context/AuthContext'
import { canAccessCalculator, fetchIsPricingAdmin } from '../../../lib/dealPricing'
import CNSectionPanel from '../../shared/CNSectionPanel'
import DocCard from '../../shared/DocCard'

const DEAL_CALC_ICON = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="1" x2="12" y2="23" />
    <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
  </svg>
)

// Ported from old-portal/js/sales.js's loadSalesDocs — a plain content-nodes
// grid, no special static cards (unlike HR), plus the "Deal Calculator" tool
// card (_salesInjectDealCalculatorCard) now that its own module is built —
// see lib/dealPricing.js and components/panels/dealpricing/. Injected via
// CNSectionPanel's extraCard slot, same shape as Finance's Purchase Request
// card.
export default function SalesPanel({ onNavigate }) {
  const { permissions } = useAuth()
  // Two independent gates, exactly as production's own
  // _salesInjectDealCalculatorCard does: the sync can_view_pricing check
  // first, then — only if that fails — an awaited is_pricing_admin() RPC,
  // so an admin-only user (no can_view_pricing) still sees the card.
  const [adminFallback, setAdminFallback] = useState(false)
  const syncAccess = canAccessCalculator(permissions)

  useEffect(() => {
    if (syncAccess) return
    let cancelled = false
    fetchIsPricingAdmin().then((isAdmin) => {
      if (!cancelled) setAdminFallback(isAdmin)
    })
    return () => {
      cancelled = true
    }
  }, [syncAccess])

  const showDealCalcCard = syncAccess || adminFallback

  // sales.js's closeSalesOverlay() calls _actOnCardClose() — close-only
  // tracking, matching production exactly (open is never tracked there).
  return (
    <CNSectionPanel
      sectionName="Sales"
      title="Sales"
      breadcrumb="Home › Sales"
      trackCardClose
      extraCard={
        showDealCalcCard ? (
          <DocCard
            icon={DEAL_CALC_ICON}
            name="Deal Calculator"
            desc="Price deals above the system-enforced floor and generate customer quotations."
            meta="⚡ Tool"
            onClick={() => onNavigate?.('dealpricing')}
          />
        ) : null
      }
    />
  )
}
