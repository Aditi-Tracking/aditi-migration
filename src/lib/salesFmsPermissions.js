// Sales FMS permission rules — their own tiny, import-free file (the enquiryPermissions.js pattern). Keep this file dependency-free.
// Who may use what is ONE per-person tier (None / Field Sales / Sales Person / Admin) kept by the database (lead_capture_roles; the tiers are defined in
// sql/step20 lc_caps) — context/LeadCaptureAccessContext.jsx hands the screen the capabilities of the signed-in person's tier under these same key names.
// These are plain `=== 'true'` checks with no client-side role shortcut, and the database enforces every one of them again.
// sales_fms_view the tab, the list and the strip (the leads the person may see) · sales_fms_update works the pipeline: pick a Reason, enter the
// negotiation time, Close · sales_fms_edit correct any stage, Reopen. Only the Admin tier holds update and edit.
export const canAccessSalesFms = (permissions) => permissions?.sales_fms_view === 'true'
export const canUpdateSalesFms = (permissions) => permissions?.sales_fms_update === 'true'
export const canEditSalesFms = (permissions) => permissions?.sales_fms_edit === 'true' && permissions?.enquiry_view_all === 'true'
