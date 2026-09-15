// Shared table shell — standardizes the rounded-card + optional title bar +
// horizontal-scroll wrapper pattern that most hand-rolled tables across the
// Dashboards Hub modules already approximate individually. `title`/`count`/
// `actions` are all optional — a table with no title bar (e.g. Vendor
// Requests) just omits them. `footer` is a slot for pagination controls.
export default function Table({ title, count, countLabel = 'row', actions, footer, children }) {
  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      {(title || actions || count != null) && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border flex-wrap">
          {title && <span className="text-[13px] font-semibold text-text">{title}</span>}
          <div className="flex items-center gap-3 ml-auto">
            {count != null && (
              <span className="text-[11.5px] text-text-muted">
                {count} {countLabel}
                {count !== 1 ? 's' : ''}
              </span>
            )}
            {actions}
          </div>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px] border-collapse">{children}</table>
      </div>
      {footer}
    </div>
  )
}
