import { useState } from 'react'
import { RU_NOT_CONNECTED_REASON_LABELS } from '../../../lib/renewals'

// Ported from old-portal/js/renewals.js's _ruCalendarCellHtml/
// ruShowCallTooltip/ruHideCallTooltip. Production drives one shared
// singleton tooltip DOM node positioned imperatively; each cell owns its own
// tooltip state here instead (React-idiomatic) — same visual behavior:
// anchored to the dot, viewport-clamped, opens below by default and flips
// above only when there isn't room.
export default function CalendarCallCell({ customerId, date, call }) {
  const [tooltip, setTooltip] = useState(null) // { left, top } | null

  let bg = 'transparent'
  let note = ''
  if (call) {
    if (call.connected) {
      bg = '#00d4aa'
      note = call.conversation_notes || ''
    } else {
      bg = '#ff5c7c'
      const reason = RU_NOT_CONNECTED_REASON_LABELS[call.not_connected_reason] || call.not_connected_reason || ''
      note = [reason, call.conversation_notes].filter(Boolean).join(' — ')
    }
  }

  function showTooltip(e) {
    if (!note) return
    const pad = 8
    const rect = e.currentTarget.getBoundingClientRect()
    // Estimated size (can't measure before the tooltip is painted) — fine
    // for a hover-only affordance, no follow-up correction needed.
    const approxWidth = Math.min(260, Math.max(80, note.length * 6))
    const approxHeight = 28
    let left = rect.left + rect.width / 2 - approxWidth / 2
    left = Math.min(Math.max(pad, left), window.innerWidth - approxWidth - pad)
    let top = rect.bottom + pad // default: below the cell
    if (top + approxHeight > window.innerHeight - pad) top = rect.top - approxHeight - pad // flip above
    top = Math.max(pad, top)
    setTooltip({ left, top })
  }

  return (
    <td className="text-center p-1.5" data-customer-id={customerId} data-date={date}>
      <span
        onMouseEnter={showTooltip}
        onMouseLeave={() => setTooltip(null)}
        className="inline-block w-[18px] h-[18px] rounded-[5px] border border-border"
        style={{ background: bg, cursor: note ? 'help' : undefined }}
      />
      {tooltip && (
        <div
          className="fixed z-[9999] max-w-[260px] rounded-md border border-border bg-surface text-text text-[11.5px] px-2.5 py-1.5 shadow-lg pointer-events-none"
          style={{ left: tooltip.left, top: tooltip.top }}
        >
          {note}
        </div>
      )}
    </td>
  )
}
