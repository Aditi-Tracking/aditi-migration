// Pure presentational card — no expand/collapse concern here (that lives in the row wrapper in
// OrgChartTree.jsx, file-tree style). Fixed-size with truncate + title tooltip (same convention
// as the shared table system's long-text columns) rather than letting a long name/role grow the
// box — this box doesn't shrink with sibling count either, since children stack vertically, not
// side-by-side.
//
// Card background/border cycles by depth (President/VP/Manager-style level coding) — the role
// pill inside stays the fixed primary-blue treatment regardless of depth, only the outer card
// changes. Falls back to cycling rather than a flat neutral tone past the defined levels, so a
// deep branch stays visually distinguishable rather than going flat.
const DEPTH_STYLES = [
  { bg: 'bg-primary-tint', border: 'border-primary/30' },
  { bg: 'bg-depth-violet-tint', border: 'border-depth-violet/30' },
  { bg: 'bg-depth-teal-tint', border: 'border-depth-teal/30' },
  { bg: 'bg-depth-amber-tint', border: 'border-depth-amber/30' },
]

export default function OrgChartNode({ row, depth, onClick }) {
  const style = DEPTH_STYLES[depth % DEPTH_STYLES.length]
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-[200px] rounded-xl border ${style.border} ${style.bg} px-3.5 py-2.5 text-center hover:brightness-95 transition-all`}
    >
      {row.is_tba ? (
        // No employee at all — display_role is the only label (e.g. "Support Head"), with a
        // muted "TBA" tag in place of the normal colored role pill (there's no separate name to
        // pair it against). Tag on top, label below — same top/bottom slot order as a real node.
        <>
          <div className="truncate rounded-full bg-surface border border-border px-2.5 py-1 text-[11px] font-extrabold text-text-muted uppercase tracking-wide">
            TBA
          </div>
          <div className="mt-1.5 text-[16px] font-bold text-text truncate" title={row.display_role}>
            {row.display_role}
          </div>
        </>
      ) : (
        <>
          {row.display_role ? (
            // bg-surface (not bg-primary-tint) so the pill still contrasts against the depth-0
            // card, whose own background is that same primary-tint — same border/text treatment
            // either way.
            <div
              className="truncate rounded-full bg-surface border border-primary/25 px-2 py-1 text-[12px] font-extrabold text-primary"
              title={row.display_role}
            >
              {row.display_role}
            </div>
          ) : (
            <div className="text-[12px] font-semibold text-text-muted">No role set</div>
          )}
          <div className="mt-1.5 text-[16px] font-bold text-text truncate" title={row.name}>
            {row.name}
          </div>
        </>
      )}
    </button>
  )
}
