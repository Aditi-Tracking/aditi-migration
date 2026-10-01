import { useEffect, useState } from 'react'
import { useAuth } from '../../../context/AuthContext'
import { canAccessCalculator, fetchIsPricingAdmin, resolveDefaultState } from '../../../lib/dealPricing'
import CalculatorTab from './CalculatorTab'
import CostMasterTab from './CostMasterTab'
import MyQuotesTab from './MyQuotesTab'

// Ported from old-portal/js/dealPricing.js's loadDealPricing/dpRenderTabBar.
// Access — two independent gates, deliberately not folded into one:
//   - Calculator tab: can_view_pricing, a plain permission flag.
//   - Cost Master tab: is_pricing_admin() RPC only — an MD/designated admin
//     must never be locked out of it based on can_view_pricing.
// Deliberate departure from production, which awaits the admin check before
// rendering anything: the admin check and the rep's default-state lookup run
// in parallel and neither blocks the other. The Calculator mounts as soon as
// the default state is known (so its first catalog fetch is already the right
// one); the Cost Master tab pops in whenever the admin check lands. A user
// without calculator access still waits on the admin check, since that alone
// decides whether they see anything.
export default function DealPricingPanel() {
  const { currentUser, permissions } = useAuth()
  const canCalc = canAccessCalculator(permissions)
  const [checkingAdmin, setCheckingAdmin] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [activeTab, setActiveTab] = useState(canCalc ? 'calc' : null)
  const [defaultState, setDefaultState] = useState(null) // gates mounting the Calculator

  useEffect(() => {
    let cancelled = false
    fetchIsPricingAdmin().then((admin) => {
      if (cancelled) return
      setIsAdmin(admin)
      if (!canCalc && admin) setActiveTab('costmaster')
      setCheckingAdmin(false)
    })
    if (canCalc) {
      resolveDefaultState(currentUser).then((s) => {
        if (!cancelled) setDefaultState(s)
      })
    }
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once at mount; canCalc is derived from permissions, which don't change mid-session
  }, [])

  const visibleTabs = [
    ...(canCalc ? [{ id: 'calc', label: 'Calculator' }] : []),
    ...(canCalc ? [{ id: 'myquotes', label: 'My Quotes' }] : []),
    ...(isAdmin ? [{ id: 'costmaster', label: 'Cost Master', badge: '(MD only)' }] : []),
  ]

  return (
    <div className="px-4 sm:px-6 py-5">
      <div className="flex items-center justify-between gap-3 mb-1">
        <div>
          <div className="text-[16px] font-semibold text-text">Deal Pricing Calculator</div>
          <div className="text-[11.5px] text-text-muted mt-0.5">Home › Sales › Deal Calculator</div>
        </div>
      </div>

      {!canCalc && checkingAdmin ? (
        <div className="text-center py-16 text-text-muted text-[13px]">Loading…</div>
      ) : !visibleTabs.length ? (
        <div className="text-center py-16 text-text-muted text-[13px]">You don't have access to this page.</div>
      ) : (
        <>
          <div className="flex gap-2 mt-5 mb-4 flex-wrap">
            {visibleTabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className={`rounded-lg border text-[12.5px] font-bold px-4 py-2 ${
                  activeTab === t.id ? 'border-primary/50 bg-primary-tint text-primary' : 'border-border bg-surface-2 text-text-muted'
                }`}
              >
                {t.label} {t.badge && <span className="opacity-75 font-medium">{t.badge}</span>}
              </button>
            ))}
          </div>

          {canCalc && (
            // Kept mounted and just hidden, so switching tabs never wipes an in-progress quote.
            <div className={activeTab === 'calc' ? '' : 'hidden'}>
              {defaultState ? (
                <CalculatorTab initialState={defaultState} />
              ) : (
                <div className="text-center py-16 text-text-muted text-[13px]">Loading…</div>
              )}
            </div>
          )}
          {activeTab === 'myquotes' && <MyQuotesTab />}
          {activeTab === 'costmaster' && <CostMasterTab />}
        </>
      )}
    </div>
  )
}
