import { FONT_SIZE_PRESETS } from '../../../lib/orgChart'

// Preset size picker for a heading's label, same preset-row pattern as ColorSwatchPicker — a
// constrained set of options, not a freeform slider/stepper, matching this app's philosophy of
// narrow, deliberate choices over arbitrary values. Each button previews its own size via an
// inline style (Tailwind can't generate a class from a runtime DB value), capped so the XL
// preset's preview doesn't overflow the fixed-size button.
export default function FontSizePicker({ value, onChange }) {
  return (
    <div className="flex gap-2">
      {FONT_SIZE_PRESETS.map((p) => (
        <button
          key={p.key}
          type="button"
          onClick={() => onChange(p.value)}
          title={p.label}
          className={`w-10 h-10 rounded-lg border flex items-center justify-center font-extrabold ${
            value === p.value ? 'border-primary ring-2 ring-offset-2 ring-primary text-primary' : 'border-border text-text-muted'
          }`}
          style={{ fontSize: Math.min(p.value, 20) }}
        >
          A
        </button>
      ))}
    </div>
  )
}
