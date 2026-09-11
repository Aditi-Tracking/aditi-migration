// Ported from old-portal/js/referral.js's _isReferralAdmin/_canSeeReferralPipeline/
// _canPostReferralRole/_applyReferralNavVisibility. Shared between the shell
// nav (navItems.js needs to know whether to show the Referral item at all)
// and the Referral panel itself (which tab set to render).

export function isReferralAdmin(currentUser) {
  if (!currentUser) return false
  if (currentUser.role === 'owner') return true
  const r = String(currentUser.rawRole || '').toLowerCase().trim()
  return r === 'hr' || r === 'mis'
}

// Access Control toggle wins if set; otherwise fall back to the legacy HR/MIS/owner check.
export function canSeeReferralPipeline(currentUser, permissions) {
  return permissions.can_view_referral_pipeline === 'true' || isReferralAdmin(currentUser)
}

export function canPostReferralRole(currentUser, permissions) {
  return permissions.can_post_referral_role === 'true' || isReferralAdmin(currentUser)
}

// Open Roles / My Referrals default to visible (everyone can refer a
// friend) unless an admin explicitly switches them off for a person —
// hence the inverse-default (!== 'false') rather than (=== 'true').
export function canViewOpenRoles(permissions) {
  return permissions.can_view_open_roles !== 'false'
}

export function canViewMyReferrals(permissions) {
  return permissions.can_view_my_referrals !== 'false'
}

export function anyReferralTabVisible(currentUser, permissions) {
  return (
    canViewOpenRoles(permissions) ||
    canViewMyReferrals(permissions) ||
    canSeeReferralPipeline(currentUser, permissions) ||
    canPostReferralRole(currentUser, permissions)
  )
}
