// Sales Rep MeCa permission rules — their own tiny, import-free file (the salesFmsPermissions.js pattern). Keep this file dependency-free.
// Who may use what is ONE per-person tier (None / Field Sales / Sales Person / Admin) kept by the database (lead_capture_roles; the tiers are defined in
// sql/step20 lc_caps) — context/LeadCaptureAccessContext.jsx hands the screen the capabilities of the signed-in person's tier under these same key names.
// These are plain `=== 'true'` checks with no client-side role shortcut, and the database enforces every one of them again.
// sales_meca_view the tab, the viewer's OWN numbers · _view_all everyone's, the company roll-up · _manage link Sales Person names, set targets (Admin).
export const canViewAllSalesMeca = (permissions) => permissions?.sales_meca_view_all === 'true'
export const canAccessSalesMeca = (permissions) => permissions?.sales_meca_view === 'true' || canViewAllSalesMeca(permissions)
export const canManageSalesMeca = (permissions) => permissions?.sales_meca_manage === 'true' && canViewAllSalesMeca(permissions)
