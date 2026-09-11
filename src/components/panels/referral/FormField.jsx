export default function FormField({ label, children, className = '' }) {
  return (
    <div className={className}>
      <label className="block text-[11.5px] font-medium text-text-muted mb-1.5">{label}</label>
      {children}
    </div>
  )
}
