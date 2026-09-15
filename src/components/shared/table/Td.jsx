// Data cell — the one standard cell padding (px-3.5 py-2.5, matching
// SmartFleet's existing convention) applied everywhere. `numeric` adds
// tabular-nums so right-aligned numeric columns line up cleanly.
export default function Td({ children, align = 'left', numeric = false, className = '', ...rest }) {
  const alignClass = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
  return (
    <td className={`px-3.5 py-2.5 ${alignClass} ${numeric ? 'tabular-nums' : ''} ${className}`} {...rest}>
      {children}
    </td>
  )
}
