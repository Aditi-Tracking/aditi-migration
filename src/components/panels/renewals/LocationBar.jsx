import { RU_LOCATIONS } from '../../../lib/renewals'

// Ported from old-portal/js/renewals.js's ruRenderLocationBar — renders only
// when there's more than one location to switch between (nothing to render
// at all otherwise, same "no bar" rule the tab bar itself uses).
export default function LocationBar({ location, allowedLocations, onChange }) {
  if (allowedLocations.length <= 1) return null

  const options = RU_LOCATIONS.filter((l) => allowedLocations.includes(l.value))

  return (
    <div className="flex items-center gap-2 mb-3.5">
      <label className="text-[12.5px] font-bold text-text-muted flex items-center gap-2">
        📍 Location
        <select
          value={location}
          onChange={(e) => onChange(e.target.value)}
          className="rounded-lg border border-border bg-surface-2 text-text px-3 py-1.5 text-[12.5px] font-bold"
        >
          {options.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
