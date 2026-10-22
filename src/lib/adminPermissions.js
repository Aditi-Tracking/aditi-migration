import { PAPI_URL } from './permissions'

// Ported from old-portal/js/adminperms.js (Access Control panel, MIS-only).
// role_defaults/user_permissions are plain key-value tables merged
// server-side by the Flask backend — adding a new permission never needs a
// frontend change beyond a label here, so keep PERM_LABELS purely cosmetic.
export const PERM_LABELS = {
  can_view_leads: '📊 SmartFleet Dashboard',
  can_view_enterprise: '🏢 Enterprise Lead Dashboard',
  can_view_entsol: '🏢 Enterprise Solutions Dashboard',
  can_view_collections: '🔁 Collections & Repeat Orders Dashboard',
  can_view_fms: '🔧 FMS Installation Tracker',
  fms_create: '📋 FMS Create Order',
  fms_support: '👷 FMS Support Actions',
  fms_config: '⚙️ FMS Config (Device Configuration)',
  fms_view_all: '👁 FMS View All Orders',
  fms_override: '🔑 FMS Override (MIS)',
  can_view_ims: '📦 IMS Dashboard',
  can_view_mapping: '🗺️ Customer Mapping — View',
  can_edit_mapping: '🗺️ Customer Mapping — Edit',
  mapping_region_headoffice: '🗺️ Mapping Region — HeadOffice',
  mapping_region_goa: '🗺️ Mapping Region — Goa',
  mapping_region_bangalore: '🗺️ Mapping Region — Bangalore',
  mapping_region_gujarat: '🗺️ Mapping Region — Gujarat',
  can_view_crm: '🚗 CRM Vehicle Dashboard',
  crm_server_premium: '🚗 CRM — Premium Server',
  crm_server_pro: '🚗 CRM — PRO Server',
  crm_server_goa: '🚗 CRM — Goa Server',
  crm_server_bangalore: '🚗 CRM — Bangalore Server',
  crm_server_gujarat: '🚗 CRM — Gujarat Server',
  can_view_crm_changes: '🔄 CRM — Vehicle Changes',
  can_view_activitylog: '📋 Activity Log',
  can_view_announcements: '🔔 View Announcements',
  can_post_announcements: '📢 Post Announcements',
  can_upload_files: '📤 Upload & Delete Files',
  checklist_scope: '✅ Task Checklist Scope',
  can_delete_tasks: '🗑️ Task Checklist — Delete Tasks',
  can_use_task_scheduler: '🗓️ Task Checklist — Task Scheduler',
  can_view_open_roles: '📋 Referral — Open Roles',
  can_view_my_referrals: '🧾 Referral — My Referrals',
  can_view_referral_pipeline: '📊 Referral — Pipeline (HR)',
  can_post_referral_role: '➕ Referral — Post a Role (HR)',
  field_service_view_all: '🛠️ Field Service — View All Entries',
  hr_employee_view: '🧑‍💼 HR Employee Master — View',
  hr_employee_edit: '🧑‍💼 HR Employee Master — Edit',
  hr_org_chart_manage: '🏢 Org Chart — Add/Remove/Reparent',
  home_content_manage: '🏠 Home Content — Manage Sections & Cards',
  can_view_pricing: '💰 Deal Calculator',
  can_access_cost_master: '🔐 Cost Master (Pricing Admin)',
}

// field_service_create is no longer permission-gated anywhere (frontend or
// RLS) but role_defaults still has an inert row for it — filtered out here
// exactly as old-portal does, rather than rendering a dead toggle.
// can_upload_quiz is the same shape: the Assessment/Quiz subsystem it once
// gated was deliberately removed (see MIGRATION-NOTES.md), but the
// permission key/value lives on in the backend untouched — filtered out
// here so it renders nowhere, rather than falling back to its raw key.
// The 25 per-key Lead Capture permissions are RETIRED: Lead Capture access is now ONE per-person tier (the Lead Capture access picker on each card, lib/leadCaptureAccess.js).
// Their rows may linger in role_defaults / user_permissions until a cleanup removes them — they no longer do anything, so they are never listed as toggles.
export const RETIRED_LEAD_CAPTURE_KEYS = ['enquiry_view', 'enquiry_create', 'enquiry_view_all', 'enquiry_assign_fms', 'enquiry_manage_dropdowns', 'enquiry_delete', 'enquiry_delete_sent', 'enquiry_field_sales', 'field_sales_form_view', 'field_sales_form_create', 'field_sales_form_view_all', 'field_sales_form_assign_fms', 'field_sales_form_delete', 'field_sales_form_manage_dropdowns', 'sales_fms_view', 'sales_fms_update', 'sales_fms_edit', 'sales_meca_view', 'sales_meca_view_all', 'sales_meca_manage', 'scot_view', 'scot_create', 'scot_update', 'scot_view_all', 'scot_manage_dropdowns']

export async function fetchAllUsersPermissions(callerEmail) {
  const res = await fetch(`${PAPI_URL}/api/admin/all-users-permissions`, {
    headers: { 'X-User-Email': callerEmail },
  })
  if (!res.ok) throw new Error('HTTP ' + res.status)
  const data = await res.json()
  return {
    users: data.users || [],
    allKeys: (data.all_permission_keys || []).filter((k) => k !== 'field_service_create' && k !== 'can_upload_quiz' && !RETIRED_LEAD_CAPTURE_KEYS.includes(k)),
  }
}

export async function saveUserPermission(callerEmail, userEmail, permission, value) {
  const res = await fetch(`${PAPI_URL}/api/admin/permissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-Email': callerEmail },
    body: JSON.stringify({ user_email: userEmail, permission, value }),
  })
  if (!res.ok) throw new Error('HTTP ' + res.status)
}
