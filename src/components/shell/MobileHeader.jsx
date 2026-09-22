export default function MobileHeader({ theme, onToggleTheme }) {
  return (
    <div className="md:hidden fixed top-0 left-0 right-0 h-[52px] z-40 flex items-center justify-between px-4 bg-surface border-b border-border">
      <div className="leading-tight">
        <div className="text-[16px] font-extrabold text-text">
          <span className="text-primary">a</span>diti
        </div>
        <div className="text-[11px] text-text-muted uppercase tracking-wide">Tracking Portal</div>
      </div>
      <button
        type="button"
        onClick={onToggleTheme}
        className="rounded-md border border-border bg-surface-2 px-2.5 py-1 text-[13px] font-semibold text-text"
      >
        {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
      </button>
    </div>
  )
}
