// Extracted from HRPanel.jsx — the compact card used for every content-nodes
// category card across modules (HR's dynamic doc cards, Sales' entire grid,
// and later After Sales/Marketing/Finance/IT Admin/Referral/Training).
export default function DocCard({ icon, name, desc, meta, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left rounded-xl border border-border bg-surface p-4 hover:border-primary/40 hover:shadow-sm transition-all flex flex-col gap-3"
    >
      <div className="w-10 h-10 rounded-lg bg-primary-tint border border-primary/20 flex items-center justify-center text-primary">
        {icon}
      </div>
      <div>
        <div className="text-[13.5px] font-semibold text-text">{name}</div>
        <div className="text-[12px] text-text-muted mt-1 leading-relaxed line-clamp-2">{desc}</div>
      </div>
      <div className="mt-auto text-[11px] font-medium text-primary bg-primary-tint border border-primary/20 rounded-full px-2.5 py-1 w-fit">
        {meta}
      </div>
    </button>
  )
}
