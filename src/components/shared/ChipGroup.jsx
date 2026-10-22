import { useRef } from 'react'
import Icon from './Icon'

// Tap-friendly pick-lists for forms used on a phone: every chip is at least 40px tall and wraps onto as many
// lines as it needs, instead of a native <select> or a tiny checkbox.
//   ChipGroup   — choose ONE (radio semantics): role="radiogroup", one tab stop, arrow keys move AND select,
//                 like native radios. Clicking the chosen chip again keeps it (a required field has no "none").
//   CheckChips  — choose ANY number (checkbox semantics): role="group", every chip is a tab stop and a
//                 toggle (aria-pressed); the result is always in the options' own order.
// Both: options [{ value, label }]; ariaLabel (or labelledBy — the id of a visible label); invalid (red outline
// after a failed submit — the form owns the message); disabled. ChipGroup also takes `tone(value)` →
// 'primary' | 'danger' | 'success' | 'warning' | 'purple' | 'neutral' to colour the CHOSEN chip (e.g. a Hot/Warm/
// Cold lead stage).
// Every chip carries a fixed 16px INDICATOR at its start — an empty ring (radio) or square (checkbox) that fills with a
// check when chosen — so the state never depends on colour alone AND choosing a chip changes nothing about any chip's
// size or position (a "✓" that appears only on the chosen chip used to widen it ~18px and reflow its neighbours).
const TONE_COLOR = {
  primary: 'var(--color-primary)',
  danger: 'var(--color-danger)',
  success: '#16A34A',
  warning: '#F0A500',
  purple: '#A855F7',
  neutral: 'var(--color-text-muted)',
}
const CHIP = 'inline-flex items-center gap-2 min-h-[40px] pl-2.5 pr-3.5 py-1.5 rounded-full border text-[13px] font-semibold select-none touch-manipulation transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60'
const IDLE = 'bg-surface-2 text-text border-border'

function chipStyle(selected, tone) {
  if (!selected) return undefined
  const c = TONE_COLOR[tone] || TONE_COLOR.primary
  return { color: c, borderColor: c, background: `color-mix(in srgb, ${c} 14%, transparent)` }
}

// The fixed-size indicator. `square` = a checkbox chip, otherwise a radio ring. Selected: filled with the chip's colour and a
// white check; unselected: an empty outline. Same box either way.
function Indicator({ selected, tone, square }) {
  const c = TONE_COLOR[tone] || TONE_COLOR.primary
  return (
    <span
      aria-hidden="true"
      className={`inline-flex items-center justify-center w-4 h-4 shrink-0 border-[1.5px] ${square ? 'rounded-[4px]' : 'rounded-full'} ${selected ? 'text-white' : 'border-text-muted/50'}`}
      style={selected ? { background: c, borderColor: c } : undefined}
    >
      {selected && <Icon name="check" size={10} strokeWidth={3.5} />}
    </span>
  )
}

function Wrap({ invalid, children, ...rest }) {
  return (
    <div {...rest} aria-invalid={invalid || undefined} className={`flex flex-wrap gap-2 ${invalid ? 'rounded-xl outline outline-1 outline-danger outline-offset-4' : ''}`}>
      {children}
    </div>
  )
}

export function ChipGroup({ options, value, onChange, ariaLabel, labelledBy, tone, invalid = false, disabled = false }) {
  const refs = useRef([])
  const selectedIndex = options.findIndex((o) => o.value === value)
  const tabStop = selectedIndex >= 0 ? selectedIndex : 0 // nothing chosen yet → the first chip is the way in

  function move(from, step) {
    const next = (from + step + options.length) % options.length
    onChange(options[next].value)
    refs.current[next]?.focus()
  }
  function onKeyDown(e, i) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') move(i, 1)
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') move(i, -1)
    else if (e.key === 'Home') move(-1, 1)
    else if (e.key === 'End') move(options.length, -1)
    else return
    e.preventDefault()
  }

  return (
    <Wrap role="radiogroup" aria-label={ariaLabel} aria-labelledby={labelledBy} invalid={invalid}>
      {options.map((o, i) => {
        const selected = o.value === value
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={i === tabStop ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            style={chipStyle(selected, tone?.(o.value))}
            className={`${CHIP} ${selected ? '' : IDLE}`}
          >
            <Indicator selected={selected} tone={tone?.(o.value)} />
            {o.label}
          </button>
        )
      })}
    </Wrap>
  )
}

export function CheckChips({ options, value, onChange, ariaLabel, labelledBy, invalid = false, disabled = false }) {
  const chosen = new Set(value)
  function toggle(v) {
    const next = new Set(chosen)
    if (next.has(v)) next.delete(v)
    else next.add(v)
    const known = new Set(options.map((o) => o.value))
    // options' own order, then anything chosen that isn't an option any more (kept, never silently dropped)
    onChange([...options.filter((o) => next.has(o.value)).map((o) => o.value), ...[...next].filter((x) => !known.has(x))])
  }
  return (
    <Wrap role="group" aria-label={ariaLabel} aria-labelledby={labelledBy} invalid={invalid}>
      {options.map((o) => {
        const selected = chosen.has(o.value)
        return (
          <button key={o.value} type="button" aria-pressed={selected} disabled={disabled} onClick={() => toggle(o.value)} style={chipStyle(selected, 'primary')} className={`${CHIP} ${selected ? '' : IDLE}`}>
            <Indicator selected={selected} square />
            {o.label}
          </button>
        )
      })}
    </Wrap>
  )
}
