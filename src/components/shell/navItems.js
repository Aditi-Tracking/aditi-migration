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

export const NAV_ITEMS = [
  { id: 'home', label: 'Home' },
  {
    id: 'dashboardshub',
    label: 'Dashboards',
    children: [
      { id: 'leads', label: 'SmartFleet', badge: 'Live', visibility: 'leadsPerm' },
      { id: 'entsol', label: 'Enterprise Solutions', badge: 'Live', visibility: 'notYetBuilt' },
      { id: 'enterprise', label: 'Enterprise Lead', badge: 'Live', visibility: 'notYetBuilt' },
      { id: 'renewals', label: 'Renewals & Collections', visibility: 'renewalsAsync' },
      { id: 'fms', label: 'FMS O2D', badge: 'Live', visibility: 'fmsPerm' },
      { id: 'tasks', label: 'Task Checklist', badge: 'Live', visibility: 'taskChecklistAsync' },
      { id: 'ims', label: 'IMS', badge: 'Live', visibility: 'notYetBuilt' },
      { id: 'mapping', label: 'Customer Mapping', badge: 'Live', visibility: 'notYetBuilt' },
      { id: 'crm', label: 'CRM Vehicle', badge: 'Live', visibility: 'notYetBuilt' },
      { id: 'fieldservice', label: 'Field Service', visibility: 'notYetBuilt' },
      { id: 'hremployee', label: 'HR Employee Master', visibility: 'notYetBuilt' },
      { id: 'taskdelegation', label: 'Task Delegation', visibility: 'notYetBuilt' },
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
// - everything else with no explicit rule is visible unconditionally once
//   logged in (about/hr/sales/aftersales/finance/products/marketing/itadmin/
//   training/resources/home/dashboardshub)
// 'notYetBuilt' items own their real check in a module we haven't built yet
// (js/tasks.js, js/ims.js, ...) — they stay hidden here
// until that module ships, at which point its real rule replaces this one.
export function isNavItemVisible(visibility, { currentUser, permissions, taskChecklistVisible, renewalsVisible }) {
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
    case 'referralAny':
      return anyReferralTabVisible(currentUser, permissions)
    default:
      return true
  }
}
