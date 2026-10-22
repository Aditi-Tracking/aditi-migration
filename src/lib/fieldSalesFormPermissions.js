// Field Sales Form permission rules — their own tiny, import-free file (the enquiryPermissions.js pattern). Keep this file dependency-free.
// Who may use what is ONE per-person tier (None / Field Sales / Sales Person / Admin) kept by the database (lead_capture_roles; the tiers are defined in
// sql/step20 lc_caps) — context/LeadCaptureAccessContext.jsx hands the screen the capabilities of the signed-in person's tier under these same key names.
// These are plain `=== 'true'` checks with no client-side role shortcut, and the database enforces every one of them again.
// field_sales_form_view the tab + the user's OWN entries · _create submit entries · _view_all every entry (Admin) · _delete / _manage_dropdowns (Admin).
// field_sales_form_assign_fms is RETIRED: every entry goes to Sales FMS the moment it is submitted.
export const canAccessFieldSalesForm = (permissions) => permissions?.field_sales_form_view === 'true'
export const canCreateFieldSalesForm = (permissions) => permissions?.field_sales_form_create === 'true'
export const canViewAllFieldSales = (permissions) => permissions?.field_sales_form_view_all === 'true'
export const canManageFieldSalesLists = (permissions) => permissions?.field_sales_form_manage_dropdowns === 'true'
export const canDeleteFieldSales = (permissions) => permissions?.field_sales_form_delete === 'true'
export const canDeletePushedFieldSales = (permissions) => canDeleteFieldSales(permissions) && permissions?.enquiry_delete_sent === 'true'
