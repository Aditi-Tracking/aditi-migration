export default function PlaceholderPanel({ label }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-24 px-6">
      <div className="w-11 h-11 rounded-lg bg-primary-tint border border-primary/20 flex items-center justify-center text-[20px] mb-3">
        🚧
      </div>
      <div className="text-[16px] font-bold text-text">{label}</div>
      <div className="text-[14.5px] text-text-muted mt-1">This module hasn't been migrated yet — coming soon.</div>
    </div>
  )
}
