export default function AnnouncementBellButton({ unreadCount, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Announcements"
      className="relative flex flex-col items-center justify-center gap-2 rounded-xl border border-primary/25 bg-primary-tint px-6 py-4 min-w-[180px] text-primary hover:border-primary/40 transition-colors"
    >
      <span className="relative inline-flex">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 01-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-danger text-white text-[9.5px] font-bold flex items-center justify-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </span>
      <span className="text-[12.5px] font-semibold">Announcements</span>
    </button>
  )
}
