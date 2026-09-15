// Extracted from HRPanel.jsx — the compact card used for every content-nodes
// category card across modules (HR's dynamic doc cards, Sales' entire grid,
// and later After Sales/Marketing/Finance/IT Admin/Referral/Training).
//
// `onDelete`, when passed, renders the MIS-gated per-card delete button (ported from
// cnRenderCatGrid's delBtn) — omit it entirely for cards with no real content_nodes row behind
// them (e.g. HR's static Organization Chart/Directory/Holiday List cards) or when the current
// user lacks can_upload_files. The caller owns the confirm()/API-call/refresh — this component
// stays a dumb renderer.
export default function DocCard({ icon, name, desc, meta, onClick, onDelete }) {
  return (
    <div className="relative">
      {onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          title={`Delete ${name}`}
          className="absolute top-2.5 right-2.5 z-10 w-7 h-7 rounded-lg bg-danger-tint border border-danger/30 text-danger flex items-center justify-center hover:bg-danger/20"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
            <path d="M10 11v6M14 11v6" />
            <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
          </svg>
        </button>
      )}
      <button
        type="button"
        onClick={onClick}
        className="text-left w-full rounded-xl border border-border bg-surface p-4 hover:border-primary/40 hover:shadow-sm transition-all flex flex-col gap-3"
      >
        <div className="w-10 h-10 rounded-lg bg-primary-tint border border-primary/20 flex items-center justify-center text-primary">
          {icon}
        </div>
        <div>
          <div className="text-[13.5px] font-semibold text-text">{name}</div>
          <div className="text-[12px] text-text-muted mt-1 leading-relaxed line-clamp-2">{desc}</div>
        </div>
        <div className="mt-auto text-[11px] font-medium text-primary bg-primary-tint border border-primary/20 rounded-full px-2.5 py-1 w-fit">
          {meta}
        </div>
      </button>
    </div>
  )
}
