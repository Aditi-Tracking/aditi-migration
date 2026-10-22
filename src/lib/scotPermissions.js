// SCOT Calls — the lost-lead follow-up tracker (the fifth Lead Capture tab); only the Admin tier holds any scot_ capability.
// Who may use what is ONE per-person tier (None / Field Sales / Sales Person / Admin) kept by the database (lead_capture_roles; the tiers are defined in
// sql/step20 lc_caps) — context/LeadCaptureAccessContext.jsx hands the screen the capabilities of the signed-in person's tier under these same key names.
// These are plain `=== 'true'` checks with no client-side role shortcut, and the database enforces every one of them again.
export const canAccessScot = (permissions) => permissions?.scot_view === 'true'
export const canCreateScot = (permissions) => permissions?.scot_create === 'true'
export const canUpdateScot = (permissions) => permissions?.scot_update === 'true'
export const canViewAllScot = (permissions) => permissions?.scot_view_all === 'true'
export const canManageScotDropdowns = (permissions) => permissions?.scot_manage_dropdowns === 'true'
// Upload needs create AND view_all; delete needs update AND view_all (the database requires the same pairs).
export const canUploadScot = (permissions) => canCreateScot(permissions) && canViewAllScot(permissions)
export const canDeleteScot = (permissions) => canUpdateScot(permissions) && canViewAllScot(permissions)
