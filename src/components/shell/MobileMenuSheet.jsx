import { useAuth } from '../../context/AuthContext'
import { useTaskChecklistNav } from '../../context/TaskChecklistNavContext'
import { NAV_ITEMS, isNavItemVisible } from './navItems'
import NavIcon from './NavIcon'

export default function MobileMenuSheet({ open, activePanel, onNavigate, onClose }) {
  const { currentUser, permissions } = useAuth()
  const { navVisible: taskChecklistVisible } = useTaskChecklistNav()
  const ctx = { currentUser, permissions, taskChecklistVisible }

  return (
    <>
      <div
        onClick={onClose}
        className={`md:hidden fixed inset-0 bg-black/50 z-40 transition-opacity ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />
      <div
        className={`md:hidden fixed left-0 right-0 bottom-0 z-50 max-h-[82vh] overflow-y-auto rounded-t-2xl bg-surface border-t border-border pb-24 transition-transform duration-200 ${
          open ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-3 sticky top-0 bg-surface">
          <span className="text-[13px] font-semibold text-text">Navigation</span>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-md border border-border bg-surface-2 text-text-muted flex items-center justify-center"
          >
            ✕
          </button>
        </div>

        <div className="px-2 space-y-0.5">
          {NAV_ITEMS.map((item) => {
            if (!isNavItemVisible(item.visibility, ctx)) return null
            return (
              <div key={item.id}>
                <button
                  type="button"
                  onClick={() => {
                    onNavigate(item.id)
                    onClose()
                  }}
                  className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2.5 text-left text-[13px] ${
                    activePanel === item.id ? 'bg-primary-tint text-primary font-medium' : 'text-text'
                  }`}
                >
                  <NavIcon id={item.id} className="w-[18px] h-[18px] shrink-0" />
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.badge && (
                    <span className="shrink-0 rounded border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
                      {item.badge}
                    </span>
                  )}
                </button>
                {/* Dashboards sub-items ARE shown inline on mobile — see the
                    asymmetry documented in navItems.js */}
                {item.children && (
                  <div className="ml-6 border-l border-border pl-2 space-y-0.5 mb-1">
                    {item.children.map((child) => {
                      if (!isNavItemVisible(child.visibility, ctx)) return null
                      return (
                        <button
                          key={child.id}
                          type="button"
                          onClick={() => {
                            onNavigate(child.id)
                            onClose()
                          }}
                          className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-[12.5px] ${
                            activePanel === child.id ? 'bg-primary-tint text-primary font-medium' : 'text-text-muted'
                          }`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0" />
                          <span className="flex-1 truncate">{child.label}</span>
                          {child.badge && (
                            <span className="shrink-0 rounded border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
                              {child.badge}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
