// Data cell — the one standard cell padding applied everywhere. `numeric`
// adds tabular-nums so right-aligned numeric columns line up cleanly.
// py-1.5 (was py-2.5, then py-2) — tightened again for FMS's row-height
// pass; applies app-wide since every migrated table shares this component.
export default function Td({ children, align = 'left', numeric = false, className = '', ...rest }) {
  const alignClass = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
  return (
    <td className={`px-3.5 py-1.5 ${alignClass} ${numeric ? 'tabular-nums' : ''} ${className}`} {...rest}>
      {children}
    </td>
  )
}
