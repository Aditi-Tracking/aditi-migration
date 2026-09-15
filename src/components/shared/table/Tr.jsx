// Row — hairline divider only, everywhere (retires every border-b-2 as each
// table migrates onto this). Hover/pointer styling is opt-in via `onClick`,
// since not every table's rows are clickable.
export default function Tr({ children, onClick, className = '' }) {
  return (
    <tr onClick={onClick} className={`border-b border-border last:border-b-0 ${onClick ? 'hover:bg-surface-2/60 cursor-pointer' : ''} ${className}`}>
      {children}
    </tr>
  )
}
