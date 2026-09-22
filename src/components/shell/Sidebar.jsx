import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useTaskChecklistNav } from '../../context/TaskChecklistNavContext'
import { useRenewalsNav } from '../../context/RenewalsNavContext'
import { useTaskDelegationNav } from '../../context/TaskDelegationNavContext'
import { isPushSubscribed, onOneSignalReady, togglePushSubscription } from '../../lib/pushNotifications'
import { NAV_ITEMS, isNavItemVisible } from './navItems'
import NavIcon from './NavIcon'

function NavRow({ item, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={item.label}
      className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[14px] leading-tight transition-colors ${
        active
          ? 'bg-primary-tint text-primary font-semibold'
          : 'text-text hover:bg-surface-2'
      }`}
    >
      <NavIcon id={item.id} className="w-[17px] h-[17px] shrink-0" />
      <span className="flex-1 truncate">{item.label}</span>
      {item.badge && (
        <span className="shrink-0 rounded border border-border bg-surface-2 px-1 py-px text-[11px] font-semibold text-text-muted">
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

  // Ported from old-portal's osToggle/_osSyncBtn (the "Enable Notifications" bell) — desktop
  // sidebar only, matching production exactly (no mobile menu-sheet equivalent exists there).
  const [pushSubscribed, setPushSubscribed] = useState(false)
  const [pushToast, setPushToast] = useState(null)

  useEffect(() => {
    onOneSignalReady(() => setPushSubscribed(isPushSubscribed()))
  }, [])

  function showPushToast(msg) {
    setPushToast(msg)
    setTimeout(() => setPushToast(null), 3000)
  }

  async function handlePushToggle() {
    const result = await togglePushSubscription()
    if (result === null) {
      showPushToast('⏳ Wait')
      return
    }
    setPushSubscribed(result)
    showPushToast(result ? '🔔 Notifications ON!' : '🔕 Notifications Off')
  }

  return (
    <aside className="hidden md:flex md:flex-col w-56 shrink-0 h-screen sticky top-0 bg-surface border-r border-border">
      <div className="flex items-center px-3 h-16 border-b border-border shrink-0">
        {/* Same source PNG + object-cover crop technique as LoginPage.jsx (a square canvas
            with the real icon+wordmark art sitting in a ~3:1 band, padded blank above/below)
            — height-driven here since the bar's fixed height is the binding constraint, not
            available width. Logo scaled down another 0.8x (60px -> 48px); bar shrunk
            proportionally (h-20 -> h-16) to keep similar breathing room around it. */}
        <img
          src={`${import.meta.env.BASE_URL}aditi_tracking_logoo.png`}
          alt="Aditi Tracking"
          className="h-12 aspect-[3/1] object-cover block"
        />
      </div>

      <div className="px-3 py-2 border-b border-border shrink-0">
        <button
          type="button"
          onClick={onToggleTheme}
          className="w-full rounded-md border border-border bg-surface-2 py-1.5 text-[14px] font-semibold text-text hover:bg-border/40 transition-colors"
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

      <div className="border-t border-border p-1.5 shrink-0">
        <button
          type="button"
          onClick={onOpenProfile}
          className="flex w-full items-center gap-2 rounded-md px-1.5 py-0.5 text-left hover:bg-surface-2 transition-colors"
        >
          <div className="w-6 h-6 rounded-full bg-primary-tint border border-primary/30 flex items-center justify-center text-[14px] font-bold text-primary shrink-0 overflow-hidden">
            {currentUser?.avatar_url ? (
              <img src={currentUser.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              (currentUser?.name || currentUser?.email || '?')[0].toUpperCase()
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold leading-tight text-text truncate">
              {currentUser?.name || currentUser?.email?.split('@')[0]}
            </div>
            <div className="text-[11px] leading-tight text-text-muted truncate">View my profile</div>
          </div>
        </button>
        <button
          type="button"
          onClick={handlePushToggle}
          className={`mt-0.5 w-full flex items-center gap-2 rounded-md border px-2 py-[7.5px] text-[12px] font-bold leading-tight transition-colors ${
            pushSubscribed
              ? 'border-primary/50 bg-primary-tint text-primary'
              : 'border-primary/20 bg-primary-tint/40 text-text hover:bg-primary-tint'
          }`}
        >
          <span>{pushSubscribed ? '🔔' : '🔕'}</span>
          <span className="flex-1 text-left">{pushSubscribed ? 'Notifications ON' : 'Enable Notifications'}</span>
          <span
            className={`rounded-full px-2 py-px text-[10.5px] leading-tight ${
              pushSubscribed ? 'bg-primary/20 text-primary' : 'bg-border/50 text-text-muted'
            }`}
          >
            {pushSubscribed ? 'ON' : 'OFF'}
          </span>
        </button>
        <button
          type="button"
          onClick={logout}
          className="mt-0.5 w-full rounded-md border border-danger/25 bg-danger-tint py-[5px] text-[12px] font-semibold leading-tight text-danger hover:bg-danger/10 transition-colors"
        >
          Logout
        </button>
      </div>

      {pushToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] rounded-xl bg-text text-white px-5 py-2.5 text-[14.5px] font-bold shadow-lg">
          {pushToast}
        </div>
      )}
    </aside>
  )
}
