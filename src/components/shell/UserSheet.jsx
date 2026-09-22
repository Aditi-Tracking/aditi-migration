import { useAuth } from '../../context/AuthContext'

export default function UserSheet({ open, onClose, onOpenProfile }) {
  const { currentUser, logout } = useAuth()

  return (
    <>
      <div
        onClick={onClose}
        className={`md:hidden fixed inset-0 bg-black/50 z-40 transition-opacity ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />
      <div
        className={`md:hidden fixed left-0 right-0 bottom-0 z-50 rounded-t-2xl bg-surface border-t border-border pb-[env(safe-area-inset-bottom,16px)] transition-transform duration-200 ${
          open ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="w-10 h-1 bg-border rounded-full mx-auto mt-3" />

        <div className="flex items-center gap-3 px-5 pt-4 pb-3.5 border-b border-border">
          <div className="w-11 h-11 rounded-full bg-primary-tint border-2 border-primary/30 flex items-center justify-center text-[17px] font-bold text-primary shrink-0 overflow-hidden">
            {currentUser?.avatar_url ? (
              <img src={currentUser.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              (currentUser?.name || currentUser?.email || '?')[0].toUpperCase()
            )}
          </div>
          <div>
            <div className="text-[16px] font-bold text-text">
              {currentUser?.name || currentUser?.email?.split('@')[0]}
            </div>
            <div className="text-[13.5px] text-text-muted mt-0.5">
              {currentUser?.rawRole
                ? currentUser.rawRole.charAt(0).toUpperCase() + currentUser.rawRole.slice(1)
                : 'Employee'}
            </div>
          </div>
        </div>

        <div className="px-4 py-3.5 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={() => {
              onClose()
              onOpenProfile()
            }}
            className="flex items-center gap-3 w-full rounded-lg border border-primary/25 bg-primary-tint px-4 py-3 text-left text-primary"
          >
            <span className="text-[20px]">👤</span>
            <div>
              <div className="text-[15px] font-semibold">My Profile</div>
              <div className="text-[13px] text-text-muted">See your details</div>
            </div>
          </button>

          <button
            type="button"
            onClick={logout}
            className="flex items-center gap-3 w-full rounded-lg border border-danger/25 bg-danger-tint px-4 py-3 text-left text-danger"
          >
            <span className="text-[20px]">🚪</span>
            <div className="text-[15px] font-semibold">Logout</div>
          </button>
        </div>
      </div>
    </>
  )
}
