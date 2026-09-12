import { useAuth } from '../../../context/AuthContext'
import { useTaskChecklistNav } from '../../../context/TaskChecklistNavContext'
import { useRenewalsNav } from '../../../context/RenewalsNavContext'
import { useTaskDelegationNav } from '../../../context/TaskDelegationNavContext'
import { NAV_ITEMS, isNavItemVisible } from '../../shell/navItems'

// Ported from old-portal/js/app.js's DASHBOARD_HUB_TILES + _renderDashboardsHub().
// Tile order is deliberate (Task Delegation pinned first, per that file's own
// comment) and intentionally differs from navItems.js's `children` order (used
// for the mobile menu's indented list) — this array exists only for this grid.
// Icons ported verbatim (same SVG paths as production); colors unified to the
// single primary palette instead of production's 12 distinct hex colors.
const HUB_TILES = [
  {
    id: 'taskdelegation',
    label: 'Task Delegation',
    icon: (
      <>
        <rect x="8" y="2" width="8" height="4" rx="1" />
        <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" />
        <path d="M9 12h6" />
        <path d="M12 9l3 3-3 3" />
      </>
    ),
  },
  {
    id: 'leads',
    label: 'SmartFleet',
    icon: <polyline points="3 12 9 12 11 6 15 18 17 12 21 12" />,
  },
  {
    id: 'entsol',
    label: 'Enterprise Solutions',
    icon: (
      <>
        <polygon points="12 2 2 7 12 12 22 7 12 2" />
        <polyline points="2 17 12 22 22 17" />
        <polyline points="2 12 12 17 22 12" />
      </>
    ),
  },
  { id: 'enterprise', label: 'Enterprise Lead', icon: <path d="M3 4h18l-7 8v6l-4 2v-8z" /> },
  {
    id: 'renewals',
    label: 'Renewals & Collections',
    icon: (
      <>
        <path d="M21 2v6h-6" />
        <path d="M3 12a9 9 0 0115-6.7L21 8" />
        <path d="M3 22v-6h6" />
        <path d="M21 12a9 9 0 01-15 6.7L3 16" />
      </>
    ),
  },
  {
    id: 'fms',
    label: 'FMS O2D',
    icon: (
      <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
    ),
  },
  {
    id: 'tasks',
    label: 'Task Checklist',
    icon: (
      <>
        <rect x="9" y="3" width="6" height="4" rx="1" />
        <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
        <path d="M9 14l2 2 4-4" />
      </>
    ),
  },
  {
    id: 'ims',
    label: 'IMS',
    icon: (
      <>
        <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
        <line x1="12" y1="22.08" x2="12" y2="12" />
      </>
    ),
  },
  {
    id: 'mapping',
    label: 'Customer Mapping',
    icon: (
      <>
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
        <circle cx="12" cy="10" r="3" />
      </>
    ),
  },
  {
    id: 'crm',
    label: 'CRM Vehicle',
    icon: (
      <>
        <path d="M3 13l2-5a2 2 0 012-1h10a2 2 0 012 1l2 5" />
        <rect x="2" y="13" width="20" height="5" rx="1" />
        <circle cx="7" cy="18" r="1.5" />
        <circle cx="17" cy="18" r="1.5" />
      </>
    ),
  },
  {
    id: 'fieldservice',
    label: 'Field Service',
    icon: (
      <>
        <rect x="3" y="7" width="18" height="13" rx="2" />
        <path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2" />
      </>
    ),
  },
  {
    id: 'hremployee',
    label: 'HR Employee Master',
    icon: (
      <>
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 00-3-3.87" />
        <path d="M16 3.13a4 4 0 010 7.75" />
      </>
    ),
  },
]

const DASHBOARDS_CHILDREN = NAV_ITEMS.find((i) => i.id === 'dashboardshub')?.children || []

export default function DashboardsHubPanel({ onNavigate }) {
  const { currentUser, permissions } = useAuth()
  const { navVisible: taskChecklistVisible } = useTaskChecklistNav()
  const { navVisible: renewalsVisible } = useRenewalsNav()
  const { navVisible: taskDelegationVisible } = useTaskDelegationNav()

  // Never re-implements a visibility rule — looks each tile's rule up from
  // the same NAV_ITEMS children the sidebar/mobile menu already use, so a
  // tile starts appearing automatically the moment that module's real rule
  // replaces 'notYetBuilt', with no change needed here. Must pass the same
  // ctx shape as Sidebar/MobileMenuSheet (including taskChecklistVisible/
  // renewalsVisible) — missing one of these was already caught once (Task
  // Checklist), which silently hid its tile regardless of the real
  // nav-reveal state.
  const visibleTiles = HUB_TILES.filter((t) => {
    const navChild = DASHBOARDS_CHILDREN.find((c) => c.id === t.id)
    return (
      navChild &&
      isNavItemVisible(navChild.visibility, { currentUser, permissions, taskChecklistVisible, renewalsVisible, taskDelegationVisible })
    )
  })

  return (
    <div className="px-4 sm:px-6 py-5">
      <div className="mb-1">
        <div className="text-[16px] font-semibold text-text">Dashboards</div>
        <div className="text-[11.5px] text-text-muted mt-0.5">Home › Dashboards</div>
      </div>

      {!visibleTiles.length ? (
        <div className="text-center py-16 text-text-muted">
          <div className="text-[32px] mb-2.5">📊</div>
          <div className="text-[13.5px] font-semibold text-text mb-1">No Dashboards Available</div>
          <div className="text-[12px]">Contact an admin via Access Control to request dashboard access.</div>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mt-5">
          {visibleTiles.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onNavigate?.(t.id)}
              className="flex flex-col items-center gap-2.5 rounded-xl border border-border bg-surface p-5 hover:border-primary/40 transition-colors"
            >
              <div className="w-12 h-12 rounded-lg bg-primary-tint border border-primary/20 flex items-center justify-center text-primary shrink-0">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  {t.icon}
                </svg>
              </div>
              <div className="text-[12.5px] font-medium text-text text-center">{t.label}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
