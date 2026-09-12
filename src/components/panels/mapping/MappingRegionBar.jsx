// Ported from old-portal/js/mapping.js's loadMappingDashboard/mpSwitchRegion. Button labels are
// the literal region strings ('HeadOffice' with no space, etc.) — matches production verbatim,
// not a display-formatting oversight.
export default function MappingRegionBar({ allowedRegions, region, onRegionClick }) {
  const buttons = ['All', ...allowedRegions]
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {buttons.map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => onRegionClick(r)}
          className={`text-[12px] font-semibold rounded-md px-2.5 py-1.5 border ${
            region === r ? 'border-primary bg-primary-tint text-primary' : 'border-border bg-surface text-text-muted'
          }`}
        >
          {r}
        </button>
      ))}
    </div>
  )
}
