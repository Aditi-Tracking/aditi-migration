const INPUT = 'h-8 w-full rounded-lg border border-border bg-surface-2 px-2 text-[12.5px] text-text outline-none focus:border-primary disabled:opacity-60'
const INVALID = '!border-danger'

// The fields of a SCOT contact, as one form body — used by the Add dialog and by the Edit mode of the client's detail. All values are text (empty =
// "not set"). `errors` is { field: message } (lib/scot.js validateScotForm).
// Props: form, errors, onChange(field, value), disabled
const FIELDS = [
  { key: 'contact_name', label: 'Contact name *', span: 2, props: { maxLength: 200, autoFocus: true } },
  { key: 'phone', label: 'Phone *', props: { maxLength: 40, inputMode: 'tel' } },
  { key: 'email', label: 'Email', props: { maxLength: 200, inputMode: 'email' } },
  { key: 'opportunity', label: 'Opportunity (what they may buy)', span: 2, props: { maxLength: 300 } },
  { key: 'city', label: 'City', props: { maxLength: 100 } },
  { key: 'lead_source', label: 'Source (where the lead came from)', props: { maxLength: 100 } },
  { key: 'sales_person', label: 'Sales person', props: { maxLength: 200 } },
  { key: 'next_call_date', label: 'Next call date', props: { type: 'date' } },
  { key: 'remark', label: 'Remark', span: 2, textarea: true, props: { maxLength: 1000 } },
]

export default function ScotFields({ form, errors = {}, onChange, disabled = false }) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
      {FIELDS.map((f) => (
        <label key={f.key} className={`block text-[11.5px] text-text-muted ${f.span === 2 ? 'col-span-2' : ''}`}>
          {f.label}
          {f.textarea ? (
            <textarea
              rows={2}
              {...f.props}
              className={`${INPUT} mt-0.5 !h-[56px] py-1.5 resize-none ${errors[f.key] ? INVALID : ''}`}
              value={form[f.key] ?? ''}
              disabled={disabled}
              aria-label={f.label.replace(/ \*$/, '')}
              aria-invalid={!!errors[f.key]}
              title={errors[f.key] || undefined}
              onChange={(e) => onChange(f.key, e.target.value)}
            />
          ) : (
            <input
              type="text"
              {...f.props}
              className={`${INPUT} mt-0.5 ${errors[f.key] ? INVALID : ''}`}
              value={form[f.key] ?? ''}
              disabled={disabled}
              aria-label={f.label.replace(/ \*$/, '')}
              aria-invalid={!!errors[f.key]}
              title={errors[f.key] || undefined}
              onChange={(e) => onChange(f.key, e.target.value)}
            />
          )}
          <span className="block min-h-[14px] text-[10.5px] leading-[14px] text-danger">{errors[f.key] || ''}</span>
        </label>
      ))}
    </div>
  )
}
