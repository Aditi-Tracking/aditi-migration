import { useEffect, useRef, useState } from 'react'
import { friendlyError, searchLeads } from '../../../lib/fieldSalesVisits'
import Icon from '../../shared/Icon'
import { INPUT } from './visitFormStyles'

// "Existing lead" — search the caller's OWN open leads by business name or phone number (fs_search_leads: own leads only; a view_all admin also sees
// everyone's, flagged mine = false — shown, but not selectable, because a visit can only be logged by the rep who owns the lead).
// Typing searches after a short pause (2 characters at least); the results are a floating list (nothing below it moves). A chosen lead shows as a card
// with a Change button. Props: value (the chosen lead row | null), onChange(lead | null), id, invalid, disabled.
// A lead row: { lead_id, business_name, contact_person, contact_number, city, mine, has_enquiry, allowed_reasons: ['Demo pending'] | ['Quotation follow-up'] }.
const DEBOUNCE_MS = 300

export default function LeadPicker({ value, onChange, id = 'fv-lead_id', invalid = false, disabled = false }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [res, setRes] = useState({ q: '', rows: [], error: '' })
  const box = useRef(null)
  const needle = q.trim()
  const searching = needle.length >= 2 && res.q !== needle

  useEffect(() => {
    if (needle.length < 2) return
    let cancelled = false
    const t = setTimeout(() => {
      searchLeads(needle)
        .then((rows) => !cancelled && setRes({ q: needle, rows, error: '' }))
        .catch((e) => !cancelled && setRes({ q: needle, rows: [], error: friendlyError(e) }))
    }, DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [needle])

  useEffect(() => {
    const down = (e) => {
      if (box.current && !box.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', down)
    return () => document.removeEventListener('mousedown', down)
  }, [])

  if (value) {
    return (
      <div id={id} className="flex items-start gap-3 rounded-lg border-[1.5px] border-border bg-surface-2 px-3.5 py-2.5 min-h-[52px]">
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold text-text break-words">{value.business_name}</div>
          <div className="text-[12.5px] text-text-muted break-words">{[value.contact_person, value.contact_number, value.city].filter(Boolean).join(' · ')}</div>
        </div>
        {!disabled && (
          <button type="button" onClick={() => { onChange(null); setQ(''); setOpen(false) }} className="shrink-0 bg-transparent border-none text-primary text-[12.5px] font-semibold underline">
            Change
          </button>
        )}
      </div>
    )
  }

  const rows = res.q === needle ? res.rows : []
  return (
    <div ref={box} className="relative">
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none">
          <Icon name="search" size={15} />
        </span>
        <input
          id={id}
          type="text"
          value={q}
          disabled={disabled}
          onChange={(e) => {
            setQ(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false)
          }}
          placeholder="Search by business name or phone number"
          autoComplete="off"
          role="combobox"
          aria-expanded={open && needle.length >= 2}
          aria-controls={`${id}-list`}
          aria-invalid={invalid || undefined}
          className={`${INPUT} pl-9 ${invalid ? 'border-danger' : 'border-border'}`}
        />
      </div>
      {open && needle.length >= 2 && (
        <div id={`${id}-list`} role="listbox" className="absolute z-30 left-0 right-0 mt-1 max-h-[260px] overflow-y-auto rounded-lg border border-border bg-surface shadow-lg">
          {searching && (
            <div className="flex items-center gap-2 px-3.5 py-3 text-[13px] text-text-muted">
              <Icon name="loader" size={14} />
              Searching…
            </div>
          )}
          {!searching && res.error && <div className="px-3.5 py-3 text-[13px] text-danger">{res.error}</div>}
          {!searching && !res.error && !rows.length && <div className="px-3.5 py-3 text-[13px] text-text-muted">No open lead of yours matches.</div>}
          {!searching &&
            rows.map((r) => (
              <button
                key={r.lead_id}
                type="button"
                role="option"
                aria-selected="false"
                disabled={!r.mine}
                onClick={() => {
                  onChange(r)
                  setOpen(false)
                }}
                className="block w-full text-left px-3.5 py-2.5 bg-transparent border-none border-b border-border hover:bg-surface-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <div className="text-[13.5px] font-semibold text-text break-words">{r.business_name}</div>
                <div className="text-[12px] text-text-muted break-words">
                  {[r.contact_person, r.contact_number, r.city].filter(Boolean).join(' · ')}
                  {!r.mine && <span className="text-[#B77900]"> · not your lead{r.created_by_name ? ` (${r.created_by_name})` : ''}</span>}
                </div>
              </button>
            ))}
        </div>
      )}
    </div>
  )
}
