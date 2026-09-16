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
//
// `zebra={false}` is also the right tool for a row that needs its own
// explicit highlight color to win outright over the zebra stripe (e.g.
// Recurring Bills' urgent/just-submitted rows) — same escape hatch, a
// different motivating reason: two competing background utility classes
// on one element are resolved by stylesheet order, not JSX prop order, so
// nothing here can be relied on to consistently "win" without opting out.
//
// `title` is forwarded to the underlying <tr> — previously silently
// dropped (Tr didn't declare it, and React drops unknown props passed to
// a component with no warning), which meant VendorRequestsTable's own
// title="Click row to view details" never actually rendered until this.
export default function Tr({ children, onClick, className = '', zebra = true, striped = false, title }) {
  const stripeClass = zebra ? 'even:bg-border/15' : striped ? 'bg-border/15' : ''
  return (
    <tr
      onClick={onClick}
      title={title}
      className={`border-b border-border last:border-b-0 ${stripeClass} ${onClick ? 'hover:bg-surface-2/60 cursor-pointer' : ''} ${className}`}
    >
      {children}
    </tr>
  )
}
