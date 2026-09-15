import { useAuth } from '../../../context/AuthContext'
import { canAccessCalculator } from '../../../lib/dealPricing'
import CalculatorTab from './CalculatorTab'

// Ported from old-portal/js/dealPricing.js's loadDealPricing/dpRenderTabBar.
// Phase 1: Calculator tab only. Cost Master (is_pricing_admin-gated,
// independent of can_view_pricing — production lands an admin-only user
// there directly since Calculator isn't even shown to them) is Phase 2; a
// can_view_pricing-less admin sees a plain access message here for now,
// same as anyone else without access — a disclosed, temporary Phase 1 gap,
// not the final landing behavior.
export default function DealPricingPanel() {
  const { permissions } = useAuth()
  const canAccess = canAccessCalculator(permissions)

  return (
    <div className="px-4 sm:px-6 py-5">
      <div className="flex items-center justify-between gap-3 mb-1">
        <div>
          <div className="text-[16px] font-semibold text-text">Deal Pricing Calculator</div>
          <div className="text-[11.5px] text-text-muted mt-0.5">Home › Sales › Deal Calculator</div>
        </div>
      </div>

      {canAccess ? (
        <>
          <div className="flex gap-2 mt-5 mb-4">
            <span className="rounded-lg border border-primary/50 bg-primary-tint text-primary text-[12.5px] font-bold px-4 py-2">
              Calculator
            </span>
          </div>
          <CalculatorTab />
        </>
      ) : (
        <div className="text-center py-16 text-text-muted text-[13px]">You don't have access to this page.</div>
      )}
    </div>
  )
}
