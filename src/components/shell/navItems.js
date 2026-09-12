// Single source of truth for the nav list, rendered by both Sidebar.jsx and
// MobileMenuSheet.jsx (the old portal duplicates this markup by hand between
// index.html's sidebar and mobile-menu sections — this is a presentational
// consolidation only, not a logic change).
//
// `children` are the "Dashboards" sub-items. IMPORTANT asymmetry, ported
// exactly from old-portal/index.html: on desktop these live inside
// #dashboardSubGroup, which is *permanently* display:none — the sidebar's
// "Dashboards" item just navigates to the panel-dashboardshub grid page, and
// the sub-group only exists as a hidden data source _renderDashboardsHub()
// reads visibility off of (see old-portal/js/app.js). On the MOBILE menu
// sheet, the same sub-items ARE shown, inline, indented under "Dashboards",
// and each navigates straight to that dashboard. Sidebar.jsx must never
// render `children`; MobileMenuSheet.jsx must.
import { anyReferralTabVisible } from '../../lib/referralPermissions'
import { canAccessCRM } from '../../lib/crmVehicle'
import { canViewHREmployee } from '../../lib/hrEmployee'
import { canAccessMapping } from '../../lib/customerMapping'
import { canAccessEnterprise } from '../../lib/enterpriseLead'

export const NAV_ITEMS = [
  { id: 'home', label: 'Home' },
  {
    id: 'dashboardshub',
    label: 'Dashboards',
    children: [
      { id: 'leads', label: 'SmartFleet', badge: 'Live', visibility: 'leadsPerm' },
      { id: 'entsol', label: 'Enterprise Solutions', badge: 'Live', visibility: 'notYetBuilt' },
      { id: 'enterprise', label: 'Enterprise Lead', badge: 'Live', visibility: 'enterprisePerm' },
      { id: 'renewals', label: 'Renewals & Collections', visibility: 'renewalsAsync' },
      { id: 'fms', label: 'FMS O2D', badge: 'Live', visibility: 'fmsPerm' },
      { id: 'tasks', label: 'Task Checklist', badge: 'Live', visibility: 'taskChecklistAsync' },
      { id: 'ims', label: 'IMS', badge: 'Live', visibility: 'notYetBuilt' },
      { id: 'mapping', label: 'Customer Mapping', badge: 'Live', visibility: 'mappingPerm' },
      { id: 'crm', label: 'CRM Vehicle', badge: 'Live', visibility: 'crmPerm' },
      // No visibility rule — field_service_create is no longer permission-gated anywhere
      // (frontend or RLS), so _fsHasAccess() in old-portal/js/fieldservice.js is
      // `_fsCanCreate() || _fsCanViewAll()` with _fsCanCreate() unconditionally true, making
      // this tile visible to every logged-in user. field_service_view_all still gates real
      // things inside the panel (My vs All Entries, delete authority) — it just no longer
      // gates visibility. See lib/fieldService.js.
      { id: 'fieldservice', label: 'Field Service' },
      { id: 'hremployee', label: 'HR Employee Master', visibility: 'hrEmployeePerm' },
      { id: 'taskdelegation', label: 'Task Delegation', visibility: 'taskDelegationAsync' },
    ],
  },
  { id: 'announcements', label: 'Announcements', visibility: 'notYetBuilt' },
  { id: 'activitylog', label: 'Activity Log', visibility: 'activityLogPerm' },
  { id: 'adminperms', label: 'Access Control', visibility: 'misOnly' },
  { id: 'about', label: 'About Organisation' },
  { id: 'hr', label: 'HR', badge: 'Policy' },
  { id: 'sales', label: 'Sales', badge: 'SOP' },
  { id: 'aftersales', label: 'After Sales' },
  { id: 'finance', label: 'Finance' },
  { id: 'products', label: 'Products', badge: 'New' },
  { id: 'marketing', label: 'Marketing', badge: 'Media' },
  { id: 'itadmin', label: 'IT & Admin' },
  { id: 'training', label: 'Training', badge: 'Videos' },
  { id: 'resources', label: 'Documents', badge: 'Docs' },
  { id: 'referral', label: 'Referral', visibility: 'referralAny' },
]

// Mirrors old-portal/js/auth.js's per-item visibility rules exactly:
// - restrictEmployee() maps can_view_leads/can_view_fms -> nav-leads/nav-fms,
//   only called for non-owners (owners always see them)
// - Access Control (adminperms) is gated to rawRole === 'mis' only
// - Activity Log is gated to can_view_activitylog === 'true' (no owner-role
//   shortcut needed — owner's role defaults already grant it)
// - Task Checklist (tasks) uses the real async rule ported from
//   _tRevealTasksNav: checklist_scope==='all' reveals instantly, otherwise
//   it stays hidden until TaskChecklistNavContext's background fetch
//   confirms the employee actually has rows in employee_checklists (fails
//   closed while unresolved and if none exist) — see that context for the
//   15s live-sync poll that keeps this current post-login
// - Referral is hidden entirely unless the user has at least one of its 4
//   permissions/admin-rights (see referralPermissions.js) — ported from
//   old-portal/js/referral.js's _applyReferralNavVisibility
// - Renewals & Collections uses the real async rule ported from
//   _applyRenewalsNavVisibility: MIS/owner, a matching active crm_persons
//   row, or an Accounts-tier grant (renewals_accounts_access) — resolved
//   once per login by RenewalsNavContext, no live-sync poll (production has
//   none for this one either)
// - Task Delegation uses the real async rule ported from
//   _applyTaskDelegationNavVisibility: a direct email match against the
//   hardcoded MD address, or an active delegation_assignees row — resolved
//   once per login by TaskDelegationNavContext, no live-sync poll (same as
//   Renewals — production has none for this module either)
// - CRM Vehicle uses the real rule ported from _canAccessCRM: can_view_crm
//   is anything other than 'false' (including a literal tier-name string —
//   see lib/crmVehicle.js's getCrmAccessLevel). Unlike every async rule
//   above, this is a plain synchronous check against `permissions` — no
//   Supabase round-trip, so no NavContext/Provider needed.
// - HR Employee Master uses the real rule ported from _heCanView: an
//   owner-or-MIS role shortcut, OR hr_employee_view==='true' — a plain
//   synchronous check against `permissions`, no NavContext needed (same
//   category as crmPerm above).
// - Customer Mapping uses the real rule ported from _applyMappingNavVisibility:
//   can_view_mapping==='true', with NO hardcoded role-string bypass in the
//   check itself (unlike CRM Vehicle/HR Employee Master) — owner/mis get in
//   only because the backend's own role_defaults already resolve this key to
//   'true' for them. Also a plain synchronous check, no NavContext needed.
// - Enterprise Lead uses the real rule ported from _canAccessEnterprise: the
//   Python backend has no can_view_enterprise column yet, so permissions.
//   can_view_enterprise is always undefined today, which falls through to a
//   hardcoded owner/mis/pc/executive-assistant/ea role check — forward-
//   compatible, since a real 'true'/'false' from the backend takes over
//   automatically once that column exists. Also a plain synchronous check.
// - everything else with no explicit rule is visible unconditionally once
//   logged in (about/hr/sales/aftersales/finance/products/marketing/itadmin/
//   training/resources/home/dashboardshub)
// 'notYetBuilt' items own their real check in a module we haven't built yet
// (js/ims.js, ...) — they stay hidden here until that module ships, at
// which point its real rule replaces this one.
export function isNavItemVisible(visibility, { currentUser, permissions, taskChecklistVisible, renewalsVisible, taskDelegationVisible }) {
  switch (visibility) {
    case 'notYetBuilt':
      return false
    case 'misOnly':
      return String(currentUser?.rawRole || currentUser?.role || '').toLowerCase().trim() === 'mis'
    case 'leadsPerm':
      return currentUser?.role === 'owner' || permissions.can_view_leads === 'true'
    case 'fmsPerm':
      return currentUser?.role === 'owner' || permissions.can_view_fms === 'true'
    case 'activityLogPerm':
      return permissions.can_view_activitylog === 'true'
    // Resolved by TaskChecklistNavContext (see PortalShell) — a shared
    // provider so Sidebar and MobileMenuSheet both read the same value and
    // can never drift out of sync with each other.
    case 'taskChecklistAsync':
      return !!taskChecklistVisible
    // Resolved by RenewalsNavContext — MIS/owner, an active crm_persons
    // match, or an Accounts-tier grant (see _applyRenewalsNavVisibility).
    case 'renewalsAsync':
      return !!renewalsVisible
    // Resolved by TaskDelegationNavContext — the hardcoded MD email, or an
    // active delegation_assignees row (see _applyTaskDelegationNavVisibility).
    case 'taskDelegationAsync':
      return !!taskDelegationVisible
    case 'crmPerm':
      return canAccessCRM(permissions)
    case 'hrEmployeePerm':
      return canViewHREmployee(currentUser, permissions)
    // Ported from _applyMappingNavVisibility: a plain `can_view_mapping === 'true'` check with no
    // hardcoded role-string bypass — the owner/mis "bypass" seen in practice comes entirely from
    // the backend's own role_defaults, not client-side logic. Same category as crmPerm.
    case 'mappingPerm':
      return canAccessMapping(permissions)
    case 'enterprisePerm':
      return canAccessEnterprise(currentUser, permissions)
    case 'referralAny':
      return anyReferralTabVisible(currentUser, permissions)
    default:
      return true
  }
}
