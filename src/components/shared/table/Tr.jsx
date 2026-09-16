// Row — hairline divider only, everywhere (retires every border-b-2 as each
// table migrates onto this). Hover/pointer styling is opt-in via `onClick`,
// since not every table's rows are clickable. even:bg-border/15 gives every
// table zebra striping for free via :nth-child — no index prop needed,
// since Tr is always a direct <tbody> child. Deliberately uses the border
// token (not surface-2, which hover already uses) so the stripe and the
// hover state never need to stay in sync with each other — this assumes no
// extra <tr> is interleaved between data rows; a future table with a
// per-row expansion row (e.g. Renewals' call-log panel) will need to opt
// that row out (odd:/even:bg-transparent) or restructure it as a
// non-sibling, or its striping will drift from that point down.
export default function Tr({ children, onClick, className = '' }) {
  return (
    <tr
      onClick={onClick}
      className={`border-b border-border last:border-b-0 even:bg-border/15 ${onClick ? 'hover:bg-surface-2/60 cursor-pointer' : ''} ${className}`}
    >
      {children}
    </tr>
  )
}
