import { useEffect, useRef } from 'react'

// Bulk-select checkbox column — a dedicated column + header select-all,
// standardizing the one real implementation of this (Task Checklist) so
// modules that embed a per-row checkbox inside a generic Action cell
// (Vendor Requests, Recurring Bills) can move to a real column instead.
// CheckboxTd's stopPropagation is automatic — a checkbox click inside a
// clickable row (Tr with onClick) must never also trigger the row's own
// click handler.
export function CheckboxTh({ checked, indeterminate, onChange }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate
  }, [indeterminate])
  return (
    <th className="px-2 py-2 w-8 text-center">
      <input ref={ref} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </th>
  )
}

export function CheckboxTd({ checked, onChange, title }) {
  return (
    <td className="px-2 py-2 w-8 text-center" onClick={(e) => e.stopPropagation()}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} title={title} />
    </td>
  )
}
