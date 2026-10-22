// Header cell — uppercase/small/semibold/muted convention (already used by
// SmartFleet/Task Checklist, now the one standard), with built-in sort
// click-handling + arrow glyph. Consolidates SmartFleet's inline sort-arrow
// logic and Renewals' separate SortableHeader/SortArrow components.
// `filter` (optional) is a node rendered after the label/arrow — in practice <ColumnFilter …/>, the
// Excel-style per-column filter. Its trigger stops click propagation, so it never toggles the sort.
export default function Th({ children, align = 'left', sortable = false, sortKey, activeSortKey, sortDir, onSort, className = '', filter = null }) {
  const isActive = sortable && activeSortKey === sortKey
  const alignClass = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
  return (
    <th
      onClick={sortable ? () => onSort(sortKey) : undefined}
      className={`px-3.5 py-2 font-semibold text-text-muted uppercase text-[10px] tracking-wide whitespace-nowrap ${alignClass} ${
        sortable ? 'cursor-pointer select-none' : ''
      } ${className}`}
    >
      {children}
      {sortable && (
        <span className={`ml-1 ${isActive ? 'text-primary' : 'text-text-muted/50'}`}>
          {isActive ? (sortDir === 1 ? '▲' : '▼') : '↕'}
        </span>
      )}
      {filter}
    </th>
  )
}
