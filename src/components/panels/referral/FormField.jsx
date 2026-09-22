export default function FormField({ label, children, className = '' }) {
  return (
    <div className={className}>
      <label className="block text-[13.5px] font-semibold text-text-muted mb-1.5">{label}</label>
      {children}
    </div>
  )
}
