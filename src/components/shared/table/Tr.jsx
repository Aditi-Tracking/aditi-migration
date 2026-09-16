// Row — hairline divider only, everywhere (retires every border-b-2 as each
// table migrates onto this). Hover/pointer styling is opt-in via `onClick`,
// since not every table's rows are clickable. even:bg-border/15 gives every
// table zebra striping for free via :nth-child — no index prop needed,
// since Tr is always a direct <tbody> child. Deliberately uses the border
// token (not surface-2, which hover already uses) so the stripe and the
// hover state never need to stay in sync with each other.
//
// This assumes no extra <tr> is interleaved between data rows — a table
// that needs one (e.g. Renewals' My Customers call-log panel, opened
// per-row and multiple at once) has two problems, not one: the inserted
// row would get a stripe of its own via nth-child, AND every row below it
// shifts one position, flipping its parity relative to what nth-child
// alone would ever produce (this compounds unpredictably once more than
// one panel can be open at a time). Opting the inserted row out of the
// stripe (odd:/even:bg-transparent) only fixes the first half.
//
// `zebra={false}` + `striped` is the escape hatch for that case: pass
// `striped` explicitly (computed from the row's own data-array index, not
// its DOM position) and Tr applies a plain class instead of relying on
// nth-child at all, so an interleaved sibling row can never shift it. The
// interleaved row itself should render as a plain <tr>, not Tr, so it
// never enters the striping sequence in the first place.
export default function Tr({ children, onClick, className = '', zebra = true, striped = false }) {
  const stripeClass = zebra ? 'even:bg-border/15' : striped ? 'bg-border/15' : ''
  return (
    <tr
      onClick={onClick}
      className={`border-b border-border last:border-b-0 ${stripeClass} ${onClick ? 'hover:bg-surface-2/60 cursor-pointer' : ''} ${className}`}
    >
      {children}
    </tr>
  )
}
