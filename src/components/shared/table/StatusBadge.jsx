// One color-keyed pill, replacing every table's own hand-rolled status
// badge/icon-text. `primary`/`danger` reuse this app's real theme tokens;
// success/warning/purple aren't in the shared theme yet, so these hex
// values consolidate what's already used ad-hoc across existing modules
// (#F0A500 amber for hold/pending states, #A855F7 purple for "Paid",
// #16A34A green for Won/Active/Approved) rather than inventing new colors.
// `color` is an escape hatch for a genuinely dynamic per-value color (not a
// fixed enum) — Renewals' own CRM-status colors stay out of scope for this
// component entirely, since that's a live <select>, not a read-only pill.
const TONES = {
  primary: { bg: 'var(--color-primary-tint)', border: 'color-mix(in srgb, var(--color-primary) 20%, transparent)', color: 'var(--color-primary)' },
  danger: { bg: 'var(--color-danger-tint)', border: 'color-mix(in srgb, var(--color-danger) 20%, transparent)', color: 'var(--color-danger)' },
  success: { bg: '#16A34A1a', border: '#16A34A4d', color: '#16A34A' },
  warning: { bg: '#F0A5001a', border: '#F0A5004d', color: '#F0A500' },
  purple: { bg: '#A855F71a', border: '#A855F74d', color: '#A855F7' },
  neutral: { bg: 'var(--color-surface-2)', border: 'var(--color-border)', color: 'var(--color-text-muted)' },
}

export default function StatusBadge({ tone = 'neutral', color, children }) {
  const t = TONES[tone] || TONES.neutral
  const style = color ? { background: color + '1a', borderColor: color + '4d', color } : { background: t.bg, borderColor: t.border, color: t.color }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold whitespace-nowrap" style={style}>
      {children}
    </span>
  )
}
