import { useAuth } from '../../context/AuthContext'

export default function BottomNav({ activePanel, onNavigate, onToggleMenu, onOpenUserSheet }) {
  const { currentUser } = useAuth()

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex items-stretch h-14 bg-surface border-t border-border pb-[env(safe-area-inset-bottom,0)]">
      <button
        type="button"
        onClick={() => onNavigate('home')}
        className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-[12px] ${
          activePanel === 'home' ? 'text-primary' : 'text-text-muted'
        }`}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" />
          <path d="M9 21V12h6v9" />
        </svg>
        Home
      </button>

      <button
        type="button"
        onClick={onToggleMenu}
        className="flex-1 flex flex-col items-center justify-center gap-0.5 text-[12px] text-text-muted"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
        Menu
      </button>

      <button
        type="button"
        onClick={onOpenUserSheet}
        className="flex-1 flex flex-col items-center justify-center gap-0.5 text-[12px] text-text-muted"
      >
        <div className="w-5 h-5 rounded-full bg-primary-tint border border-primary/30 flex items-center justify-center text-[11px] font-bold text-primary overflow-hidden">
          {currentUser?.avatar_url ? (
            <img src={currentUser.avatar_url} alt="" className="w-full h-full object-cover" />
          ) : (
            (currentUser?.name || currentUser?.email || '?')[0].toUpperCase()
          )}
        </div>
        <span className="truncate max-w-[52px]">{(currentUser?.name || 'User').split(' ')[0]}</span>
      </button>
    </div>
  )
}
