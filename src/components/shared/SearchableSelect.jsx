import { useEffect, useMemo, useRef, useState } from 'react'

// Search-as-you-type picker for "pick one item to add" flows. Same shape as the
// hand-rolled pickers elsewhere (text input + absolutely-positioned list +
// outside-click close), plus ArrowUp/ArrowDown/Enter/Escape. Stateless about the
// selection: onSelect(value) fires and the box clears, matching the native
// "+ Add…" selects it replaces.
// options: [{ value, label }]
export default function SearchableSelect({ options, placeholder, onSelect, disabled = false, className = '' }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const boxRef = useRef(null)
  const listRef = useRef(null)

  const matches = useMemo(() => {
    const q = query.toLowerCase().trim()
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options
  }, [options, query])

  useEffect(() => {
    function onDocDown(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocDown)
    return () => document.removeEventListener('mousedown', onDocDown)
  }, [])

  useEffect(() => {
    listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  function choose(opt) {
    onSelect(opt.value)
    setQuery('')
    setOpen(false)
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActive((i) => Math.min(i + 1, matches.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      if (open && matches[active]) {
        e.preventDefault()
        choose(matches[active])
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        autoComplete="off"
        value={query}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => {
          setQuery(e.target.value)
          setActive(0)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[12.5px] text-text outline-none disabled:opacity-50"
      />
      {open && !disabled && (
        <div
          ref={listRef}
          role="listbox"
          className="absolute z-30 top-full left-0 mt-1 w-max min-w-full max-w-[320px] max-h-[240px] overflow-y-auto bg-surface border border-border rounded-lg shadow-lg"
        >
          {matches.length ? (
            matches.map((o, i) => (
              <div
                key={o.value}
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  e.preventDefault() // keep input focus; select before blur
                  choose(o)
                }}
                className={`px-3 py-2 cursor-pointer text-[12.5px] text-text border-b border-border last:border-0 ${i === active ? 'bg-surface-2' : ''}`}
              >
                {o.label}
              </div>
            ))
          ) : (
            <div className="px-3 py-2.5 text-[12px] text-text-muted">No matches</div>
          )}
        </div>
      )}
    </div>
  )
}
