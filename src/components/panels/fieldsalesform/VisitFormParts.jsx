// Small layout pieces of the Visit Form. Layout-stable, like the rest of Lead Capture: the label row has a fixed height and the message under a field is a
// RESERVED line — a validation message (or a hint) appearing never pushes the fields below it down.
export function Field({ id, label, required = true, error, hint, extra, className = '', children }) {
  return (
    <div className={`mb-1 ${className}`}>
      <div className="flex items-center justify-between gap-2 mb-1 min-h-[24px]">
        <label id={`${id}-label`} htmlFor={id} className="block text-[12.5px] font-semibold text-text-muted">
          {label}
          {required ? ' *' : ''}
        </label>
        {extra}
      </div>
      {children}
      <div aria-live="polite" className={`min-h-[18px] pt-0.5 text-[12px] leading-[16px] ${error ? 'font-semibold text-danger' : 'text-text-muted'}`}>
        {error || hint}
      </div>
    </div>
  )
}

export function Section({ title, children }) {
  return (
    <div className="mt-4 first:mt-0">
      <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted pb-1.5 mb-2 border-b border-border">{title}</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 sm:gap-x-4">{children}</div>
    </div>
  )
}

const NOTICE = {
  info: 'border-primary/30 bg-primary-tint text-text',
  warn: 'border-[#f0a500]/40 bg-[#f0a500]/10 text-text',
  danger: 'border-danger/30 bg-danger-tint text-text',
}
// A message that needs a decision (the phone check's "this is already your lead" / "adopt it?").
export function Notice({ tone = 'info', title, children, className = '' }) {
  return (
    <div role="status" className={`rounded-xl border px-3.5 py-3 text-[13px] leading-[19px] ${NOTICE[tone] || NOTICE.info} ${className}`}>
      {title && <div className="font-bold mb-0.5">{title}</div>}
      {children}
    </div>
  )
}
