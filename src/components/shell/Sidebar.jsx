import { useAuth } from '../../context/AuthContext'
import { useTaskChecklistNav } from '../../context/TaskChecklistNavContext'
import { useRenewalsNav } from '../../context/RenewalsNavContext'
import { useTaskDelegationNav } from '../../context/TaskDelegationNavContext'
import { NAV_ITEMS, isNavItemVisible } from './navItems'
import NavIcon from './NavIcon'

function NavRow({ item, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={item.label}
      className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] leading-tight transition-colors ${
        active
          ? 'bg-primary-tint text-primary font-medium'
          : 'text-text hover:bg-surface-2'
      }`}
    >
      <NavIcon id={item.id} className="w-[17px] h-[17px] shrink-0" />
      <span className="flex-1 truncate">{item.label}</span>
      {item.badge && (
        <span className="shrink-0 rounded border border-border bg-surface-2 px-1 py-px text-[9px] font-medium text-text-muted">
          {item.badge}
        </span>
      )}
    </button>
  )
}

export default function Sidebar({ activePanel, onNavigate, onToggleTheme, theme, onOpenProfile }) {
  const { currentUser, permissions, logout } = useAuth()
  const { navVisible: taskChecklistVisible } = useTaskChecklistNav()
  const { navVisible: renewalsVisible } = useRenewalsNav()
  const { navVisible: taskDelegationVisible } = useTaskDelegationNav()
  const ctx = { currentUser, permissions, taskChecklistVisible, renewalsVisible, taskDelegationVisible }

  return (
    <aside className="hidden md:flex md:flex-col w-56 shrink-0 h-screen sticky top-0 bg-surface border-r border-border">
      <div className="flex items-center gap-2 px-3 h-11 border-b border-border shrink-0">
        <span className="text-[14px] font-bold text-text">
          <span className="text-primary">a</span>DITI
        </span>
        <span className="text-[9px] text-text-muted uppercase tracking-wide leading-none">
          Tracking Portal
        </span>
      </div>

      <div className="px-3 py-2 border-b border-border shrink-0">
        <button
          type="button"
          onClick={onToggleTheme}
          className="w-full rounded-md border border-border bg-surface-2 py-1.5 text-[12px] font-medium text-text hover:bg-border/40 transition-colors"
        >
          {theme === 'dark' ? '☀️ Light Mode' : '🌙 Dark Mode'}
        </button>
      </div>

      {/* NOTE: "Dashboards" here intentionally never renders its `children` —
          see navItems.js's comment on the #dashboardSubGroup asymmetry. */}
      <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0">
        {NAV_ITEMS.map((item) => {
          if (!isNavItemVisible(item.visibility, ctx)) return null
          return (
            <NavRow
              key={item.id}
              item={item}
              active={activePanel === item.id || (item.id === 'dashboardshub' && item.children?.some((c) => c.id === activePanel))}
              onClick={() => onNavigate(item.id)}
            />
          )
        })}
      </nav>

      <div className="border-t border-border p-2 shrink-0">
        <button
          type="button"
          onClick={onOpenProfile}
          className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-surface-2 transition-colors"
        >
          <div className="w-7 h-7 rounded-full bg-primary-tint border border-primary/30 flex items-center justify-center text-[12px] font-semibold text-primary shrink-0 overflow-hidden">
            {currentUser?.avatar_url ? (
              <img src={currentUser.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              (currentUser?.name || currentUser?.email || '?')[0].toUpperCase()
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-medium text-text truncate">
              {currentUser?.name || currentUser?.email?.split('@')[0]}
            </div>
            <div className="text-[10.5px] text-text-muted truncate">View my profile</div>
          </div>
        </button>
        <button
          type="button"
          onClick={logout}
          className="mt-1 w-full rounded-md border border-danger/25 bg-danger-tint py-1 text-[11.5px] font-medium text-danger hover:bg-danger/10 transition-colors"
        >
          Logout
        </button>
      </div>
    </aside>
  )
}
