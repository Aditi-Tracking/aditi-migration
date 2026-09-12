// Shared layout pieces for the two-column detail-modal pattern (Customer
// Detail Modal, Accounts Detail Modal) — extracted here once both needed it
// identically, rather than duplicating the same three small components in
// each file.
export function Section({ title, tint, children }) {
  return (
    <div className={`rounded-lg border p-3 ${tint ? 'border-[#f0a50040] bg-[#f0a5000f]' : 'border-border bg-surface-2'}`}>
      <div className="text-[10.5px] font-bold uppercase tracking-wide text-text-muted mb-2">{title}</div>
      {children}
    </div>
  )
}

export function FieldGrid({ children }) {
  return <div className="grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-2 text-[13px] text-text items-center">{children}</div>
}

export function FieldRow({ label, value }) {
  return (
    <>
      <span className="text-text-muted font-semibold">{label}</span>
      <span>{value}</span>
    </>
  )
}
