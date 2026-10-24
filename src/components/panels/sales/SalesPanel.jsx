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

// Plain external links (YouTube session recordings + a few Drive files), same "hardcoded, no
// Supabase" shape as Marketing's SmartFleet/Enterprise Solution link folders — see
// CNSectionPanel's own linkFolders comment. The 3 Drive links came with no names attached, so
// they're numbered generically.
const SALES_LINK_FOLDERS = {
  'akshar yadav sales session': [
    { name: 'AY week 0 USE- Akshar Yadav', url: 'https://youtu.be/wWVoZ4XVLhs' },
    { name: 'Akshar Yadav Session 1 22082026', url: 'https://youtu.be/fX-l1w7wKMU' },
    { name: 'AY Revision 1', url: 'https://youtu.be/sIVbAtpdWsY' },
    { name: 'AY USE Day 1', url: 'https://youtu.be/afYoDA7a_wo' },
    { name: 'AY Q&A 1', url: 'https://youtu.be/YOQoq-8pkm0' },
    { name: 'AY USE Week 2', url: 'https://youtu.be/2K0KsBIovVE' },
    { name: 'AY USE day 2', url: 'https://youtu.be/hmyM2OGHUKM' },
    { name: 'Akshar Yadav Week 6 (3rd October 2026)', url: 'https://youtu.be/utWIF74LwBs' },
    { name: 'Drive File 1', url: 'https://drive.google.com/file/d/1LZSaz-oHNWOA4esOttqr8Cttx-WB4GaP/view?usp=drive_link' },
    { name: 'Drive File 2', url: 'https://drive.google.com/file/d/1Da46R__2z9tuISvhscF2e4F-PiMbv93N/view?usp=drive_link' },
    { name: 'Drive File 3', url: 'https://drive.google.com/file/d/1bMk-KJuht_0EAdxpe3Bu25NtD27g6zfj/view?usp=drive_link' },
  ],
}

// Deliberately NO role-based fallback (unlike lib/tenderDashboard.js's canAccessTender) — access
// to this folder is meant to be decided entirely by the Access Control panel's real
// can_view_akshar_yadav_session toggle, never by frontend code. Until the Flask backend actually
// defines that permission, it reads as undefined for everyone and this folder stays hidden from
// everyone (including owner/mis) rather than silently granting access on its own. See PERM_LABELS
// in lib/adminPermissions.js for the cosmetic label already in place for once the backend adds it.
function canViewAksharYadavSession(permissions) {
  return permissions?.can_view_akshar_yadav_session === 'true'
}

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
  const hiddenCategoryNames = canViewAksharYadavSession(permissions) ? [] : ['akshar yadav sales session']

  // sales.js's closeSalesOverlay() calls _actOnCardClose() — close-only
  // tracking, matching production exactly (open is never tracked there).
  return (
    <CNSectionPanel
      sectionName="Sales"
      title="Pre-Sales"
      breadcrumb="Home › Pre-Sales"
      trackCardClose
      linkFolders={SALES_LINK_FOLDERS}
      hiddenCategoryNames={hiddenCategoryNames}
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
