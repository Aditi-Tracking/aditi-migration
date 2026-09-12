import { useEffect, useRef, useState } from 'react'
import { searchOdooCustomers, saveMapping, clearMapping } from '../../../lib/customerMapping'

// Ported from old-portal/js/mapping.js's mpInlineSearch/mpInlineClick/mpInlineSelect/
// mpInlineBlur/mpClearMapping. Editor-only — MappingTable renders plain read-only text instead
// when !canEdit.
//
// Two DELIBERATELY different empty-query sentinels, ported exactly: typing (debounced 200ms)
// searches ' ' (a literal space) when the box is empty, while opening the dropdown on click
// searches 'a' when empty — different characters, both preserved rather than unified, since the
// backend's match behavior for each isn't ours to change.
export default function MappingOdooCell({ row, callerEmail, onSaved }) {
  const [value, setValue] = useState(row.canonical_name || '')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const timerRef = useRef(null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resyncs the draft after an external row update (save/clear/region reload), not a render loop
    setValue(row.canonical_name || '')
  }, [row.canonical_name, row.gps_alias_id])

  useEffect(() => () => clearTimeout(timerRef.current), [])

  function handleInput(e) {
    const v = e.target.value
    setValue(v)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      const q = v.trim()
      const data = await searchOdooCustomers(q.length > 0 ? q : ' ')
      if (!data.length) {
        setOpen(false)
        return
      }
      setResults(data)
      setOpen(true)
    }, 200)
  }

  async function handleClick() {
    if (open) return // already open — don't refetch, matches production
    const q = value.trim()
    const data = await searchOdooCustomers(q.length > 0 ? q : 'a')
    if (!data.length) return
    setResults(data)
    setOpen(true)
  }

  function handleBlur() {
    // Delay so a dropdown item's onMouseDown fires before this closes it
    setTimeout(() => setOpen(false), 250)
  }

  async function handleSelect(odooId, odooName) {
    setOpen(false)
    setValue(odooName)
    try {
      await saveMapping({ gpsAliasId: row.gps_alias_id, gpsName: row.gps_name, odooId, canonicalName: odooName, tier: row.tier }, callerEmail)
      onSaved(row.gps_alias_id, { is_mapped: true, canonical_name: odooName })
    } catch {
      alert('Save failed!')
      setValue(row.canonical_name || '')
    }
  }

  async function handleClear() {
    if (!row.customer_id) return
    if (!confirm(`Clear the mapping for "${row.gps_name}"?`)) return
    try {
      await clearMapping(row.gps_alias_id, callerEmail)
      setValue('')
      onSaved(row.gps_alias_id, { is_mapped: false, canonical_name: '', customer_id: null })
    } catch {
      alert('Clear failed!')
    }
  }

  return (
    <div className="relative">
      <div className="flex items-center border border-border rounded-md bg-surface-2 overflow-hidden">
        <input
          type="text"
          value={value}
          placeholder="Search Odoo customer..."
          autoComplete="off"
          onChange={handleInput}
          onClick={handleClick}
          onBlur={handleBlur}
          className="flex-1 px-2 py-1.5 bg-transparent text-[12px] text-text outline-none min-w-0"
        />
        {row.canonical_name && (
          <span onClick={handleClear} title="Clear mapping" className="px-2 text-[16px] leading-none text-danger cursor-pointer shrink-0">
            ✕
          </span>
        )}
      </div>
      {open && (
        <div className="absolute top-full left-0 right-0 mt-0.5 bg-surface border border-border rounded-lg max-h-[200px] overflow-y-auto shadow-lg z-50">
          {results.map((o) => (
            <div
              key={o.id}
              onMouseDown={() => handleSelect(o.id, o.odoo_name)}
              className="px-3 py-2 text-[13px] text-text border-b border-border last:border-0 cursor-pointer hover:bg-surface-2"
            >
              {o.odoo_name}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
