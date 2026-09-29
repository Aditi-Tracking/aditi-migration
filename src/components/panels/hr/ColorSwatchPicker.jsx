import { COLOR_PRESETS } from '../../../lib/orgChart'

// Shared preset color picker — used today by group headings, built reusably for node recoloring
// (Phase 4) too rather than a group-specific one-off. A constrained preset row, not an arbitrary
// color wheel, matching this app's deliberately narrow palette philosophy.
export default function ColorSwatchPicker({ value, onChange }) {
  return (
    <div className="flex gap-2">
      {COLOR_PRESETS.map((p) => (
        <button
          key={p.key}
          type="button"
          onClick={() => onChange(p.key)}
          title={p.label}
          className={`w-7 h-7 rounded-full ${p.swatch} ${value === p.key ? 'ring-2 ring-offset-2 ring-primary' : ''}`}
        />
      ))}
    </div>
  )
}
