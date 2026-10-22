// Enquiry Capture permission rules — deliberately their own tiny, import-free file (the referralPermissions.js pattern) so the main bundle never pulls
// in lib/enquiries.js (REST calls, Excel parsing). Keep this file dependency-free.
// Who may use what is ONE per-person tier (None / Field Sales / Sales Person / Admin) kept by the database (lead_capture_roles; the tiers are defined in
// sql/step20 lc_caps) — context/LeadCaptureAccessContext.jsx hands the screen the capabilities of the signed-in person's tier under these same key names.
// These are plain `=== 'true'` checks with no client-side role shortcut, and the database enforces every one of them again.
export const canAccessEnquiry = (permissions) => permissions?.enquiry_view === 'true'
export const canCreateEnquiry = (permissions) => permissions?.enquiry_create === 'true'
export const canViewAllEnquiries = (permissions) => permissions?.enquiry_view_all === 'true'
// Send to FMS is part of the admin (view_all) UI only — enquiry_assign_fms alone does not show it.
export const canSendEnquiriesToFms = (permissions) => canViewAllEnquiries(permissions) && permissions?.enquiry_assign_fms === 'true'
export const canManageEnquiryDropdowns = (permissions) => permissions?.enquiry_manage_dropdowns === 'true'
// Deleting has its own key and needs NO view_all: on its own it lets a user delete their OWN unsent rows; together with
// enquiry_view_all, anyone's unsent rows (the database — delete_enquiries() — decides which).
// enquiry_delete_sent is ADDITIVE: with enquiry_delete it also lets the user delete rows already SENT to FMS (a soft delete that
// also removes the lead's pipeline, its source Field Sales entry and its MeCa figures). Without enquiry_delete it does nothing.
export const canDeleteEnquiries = (permissions) => permissions?.enquiry_delete === 'true'
export const canDeleteSentEnquiries = (permissions) => canDeleteEnquiries(permissions) && permissions?.enquiry_delete_sent === 'true'
