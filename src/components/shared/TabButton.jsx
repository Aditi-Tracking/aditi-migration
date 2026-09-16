// One shared active/inactive toggle button for tab bars and filter-chip
// rows — consolidates a convention every one of these already got right by
// hand (font-weight and padding held constant across states, only
// background/text/border swap) into a single component, so a future tab
// bar can't accidentally regress it the way a hand-written className
// string always could. `transition-colors` is deliberate visual polish on
// top of that already-correct convention, not a fix for the layout-shift
// bug the constant-width rule prevents — see MIGRATION-NOTES.md.
//
// `variant="tab"` — bold, rounded-lg tab-bar style (Renewals' tab bar,
// Field Service, HR Employee Master, Task Checklist, Task Delegation).
// `variant="chip"` — smaller, rounded-md filter-chip style (Vendor
// Requests' and Recurring Bills' status filters).
const VARIANT_CLASSES = {
  tab: 'rounded-lg px-4 py-1.5 text-[12.5px] font-semibold',
  chip: 'rounded-md px-3 py-1.5 text-[12px] font-semibold',
}

export default function TabButton({ active, onClick, variant = 'tab', children, className = '' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border transition-colors ${VARIANT_CLASSES[variant]} ${
        active ? 'bg-primary text-white border-primary' : 'bg-surface-2 text-text-muted border-border'
      } ${className}`}
    >
      {children}
    </button>
  )
}
