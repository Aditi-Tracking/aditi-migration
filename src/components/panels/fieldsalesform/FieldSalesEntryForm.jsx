import { useEffect, useMemo, useRef, useState } from 'react'
import {
  FS_LIST,
  FS_LIST_LABELS,
  INDIAN_STATES,
  activeFieldSalesOptions,
  addFieldSalesOption,
  createFieldSalesEntry,
  emptyFieldSalesForm,
  leadStageTone,
  setFieldSalesOptionActive,
  validateFieldSalesForm,
} from '../../../lib/fieldSalesForm'
import { CheckChips, ChipGroup } from '../../shared/ChipGroup'
import Icon from '../../shared/Icon'
import ManageListPopover from '../../shared/ManageListPopover'
import Toast from '../../shared/Toast'

// 16px on a phone (iOS Safari zooms the page on focusing anything smaller), the app's usual 14px from sm up.
const INPUT = 'w-full box-border px-3.5 py-3 rounded-lg border-[1.5px] bg-surface-2 text-text text-[16px] sm:text-[14px] outline-none focus:border-primary disabled:opacity-60'
// The order fields appear in — used to find the first invalid one and for the keyboard's Next/Enter.
const FIELD_ORDER = ['source_of_lead', 'city', 'state', 'visit_purpose', 'lead_name', 'contact_number', 'email_id', 'current_gps_provider', 'fleet_size', 'lead_stage', 'demo_given', 'product_interested', 'expected_revenue', 'expected_amount_receiving_date']
const TEXT_FIELDS = ['city', 'state', 'lead_name', 'contact_number', 'email_id', 'current_gps_provider', 'fleet_size', 'expected_revenue', 'expected_amount_receiving_date']
const LIST_KEYS = { source_of_lead: FS_LIST.SOURCE, visit_purpose: FS_LIST.PURPOSE, lead_stage: FS_LIST.STAGE, product_interested: FS_LIST.PRODUCT }
const YES_NO = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
]

// Layout-stable: the label row has a fixed height (the Manage link appears when the lists arrive) and the message under
// the field is a RESERVED line — a validation message appearing never pushes the fields below it down.
function Field({ id, label, required = true, error, extra, className = '', children }) {
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
      <div aria-live="polite" className="min-h-[18px] pt-0.5 text-[12px] leading-[16px] font-semibold text-danger">
        {error}
      </div>
    </div>
  )
}

// The mobile-first entry form, shown in the Entries table's "New Entry" modal: tap-sized chips for the pick-lists, native
// keyboards for the rest (tel / email / numeric / date), 16px inputs. A field rep logs a lead here; the entry is write-once
// (no edit afterwards). Everything is required except Email. Messages sit in a reserved line under their field; a failed
// submit scrolls to and focuses the first problem and shows a toast. A server-side refusal (e.g. an option retired a moment
// ago) is a toast too, and the typed values are KEPT. Enter in a text field moves to the next one (a phone's "Next"), it never
// submits. On success the parent closes the modal (this form is discarded with it — nothing carries over to the next entry).
// Props: lists (the 4 pick-lists, null while loading), listsError, onListsChanged() (force-refetch — resolves, never
// rejects), canManage (Manage next to each list), onSaved(savedRow), onCancel(), onDirtyChange(bool) — true while
// anything has been typed or picked, so the modal can ask before throwing it away.
export default function FieldSalesEntryForm({ lists, listsError, onListsChanged, canManage, onSaved, onCancel, onDirtyChange }) {
  const [form, setForm] = useState(emptyFieldSalesForm)
  const [errors, setErrors] = useState({})
  const [toast, setToast] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [manageKey, setManageKey] = useState(null) // a FS_LIST value | null
  const [manageEl, setManageEl] = useState(null)
  const manageAnchor = useMemo(() => ({ current: manageEl }), [manageEl]) // PortalPopover wants a ref-shaped anchor
  const busy = useRef(false) // synchronous double-tap guard (state lags a render)
  const [pristine] = useState(() => JSON.stringify(emptyFieldSalesForm()))
  const dirty = JSON.stringify(form) !== pristine

  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])

  const options = useMemo(() => Object.fromEntries(Object.values(FS_LIST).map((t) => [t, activeFieldSalesOptions(lists?.[t])])), [lists])
  const loading = lists === null && !listsError

  const set = (field) => (value) => {
    setForm((f) => ({ ...f, [field]: value }))
    setErrors((e) => (e[field] ? { ...e, [field]: undefined } : e))
  }

  function focusField(key) {
    const el = document.getElementById(`fs-${key}`)
    if (!el) return
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    const target = el.matches('input,select,textarea') ? el : el.querySelector('button:not([disabled])')
    target?.focus({ preventScroll: true })
  }
  // Enter on a text field = "Next"; on the last one it just closes the keyboard.
  function onEnter(e, key) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const next = TEXT_FIELDS[TEXT_FIELDS.indexOf(key) + 1]
    if (next) document.getElementById(`fs-${next}`)?.focus()
    else e.currentTarget.blur()
  }

  async function submit() {
    if (busy.current) return
    const found = validateFieldSalesForm(form)
    // A value picked a moment ago may have been retired since (by a manager, via Manage) — refuse it here, politely.
    for (const [field, type] of Object.entries(LIST_KEYS)) {
      const have = new Set(options[type].map((o) => o.value))
      const picked = field === 'product_interested' ? form[field] : [form[field]].filter(Boolean)
      const gone = picked.filter((v) => !have.has(v))
      if (gone.length && !found[field]) found[field] = `${gone.join(', ')} is no longer available — choose again.`
    }
    setErrors(found)
    const firstBad = FIELD_ORDER.find((k) => found[k])
    if (firstBad) {
      const count = Object.keys(found).length
      setToast({ tone: 'error', text: `Please fix the ${count === 1 ? 'highlighted field' : `${count} highlighted fields`}.` })
      focusField(firstBad)
      return
    }
    busy.current = true
    setSubmitting(true)
    setToast(null)
    try {
      onSaved?.(await createFieldSalesEntry(form))
    } catch (e) {
      // A dropped connection on a phone surfaces as a bare TypeError ("Failed to fetch") — say what it means.
      const text = e instanceof TypeError ? "Couldn't reach the server — check your connection and try again. Nothing was saved." : e.message
      setToast({ tone: 'error', text })
    } finally {
      busy.current = false
      setSubmitting(false)
    }
  }

  // ---- managed lists (Manage) ----
  const manage = manageKey ? { type: manageKey, label: FS_LIST_LABELS[manageKey] } : null
  const manageLink = (type) =>
    canManage && lists ? (
      <button
        type="button"
        aria-label={`Manage ${FS_LIST_LABELS[type]}`}
        onClick={(e) => {
          setManageEl(e.currentTarget)
          setManageKey(type)
        }}
        className="inline-flex items-center gap-1 text-[12px] font-semibold text-primary bg-transparent border-none px-1 py-0.5"
      >
        <Icon name="settings" size={13} />
        Manage
      </button>
    ) : null
  async function manageAdd(value) {
    await addFieldSalesOption(manage.type, value)
    await onListsChanged()
  }
  async function manageSetActive(item, active) {
    await setFieldSalesOptionActive(item.id, active)
    // A value that was just retired must not stay picked in the form.
    if (!active) {
      setForm((f) => ({
        ...f,
        source_of_lead: f.source_of_lead === item.value ? '' : f.source_of_lead,
        visit_purpose: f.visit_purpose === item.value ? '' : f.visit_purpose,
        lead_stage: f.lead_stage === item.value ? '' : f.lead_stage,
        product_interested: f.product_interested.filter((v) => v !== item.value),
      }))
    }
    await onListsChanged()
  }

  const text = (key, label, extra = {}) => {
    const { className, ...inputProps } = extra
    return (
      <Field id={`fs-${key}`} label={label} required={key !== 'email_id'} error={errors[key]} className={className}>
        <input
          id={`fs-${key}`}
          type="text"
          value={form[key]}
          onChange={(e) => set(key)(e.target.value)}
          onKeyDown={(e) => onEnter(e, key)}
          aria-invalid={!!errors[key] || undefined}
          autoComplete="off"
          enterKeyHint="next"
          className={`${INPUT} ${errors[key] ? 'border-danger' : 'border-border'}`}
          {...inputProps}
        />
      </Field>
    )
  }
  const optionsBody = (type, render) => {
    if (loading) return <div className="text-[13px] text-text-muted py-2">Loading options…</div>
    if (listsError && lists === null) {
      return (
        <div className="text-[13px] text-danger py-2">
          Couldn&apos;t load the options ({listsError}).
          <button type="button" onClick={() => onListsChanged()} className="ml-2 underline bg-transparent border-none text-danger font-bold">
            Retry
          </button>
        </div>
      )
    }
    if (!options[type].length) return <div className="text-[13px] text-text-muted py-2">No options yet{canManage ? ' — use Manage to add some.' : ' — ask an admin to add some.'}</div>
    return render()
  }
  const chipField = (key, label, type, node) => (
    <Field id={`fs-${key}`} label={label} error={errors[key]} extra={manageLink(type)} className="sm:col-span-2">
      <div id={`fs-${key}`}>{optionsBody(type, node)}</div>
    </Field>
  )

  return (
    <div>
      <datalist id="fs-states">
        {INDIAN_STATES.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>

      <div className="grid grid-cols-1 sm:grid-cols-2 sm:gap-x-4">
        {chipField('source_of_lead', 'Source of Lead', FS_LIST.SOURCE, () => (
          <ChipGroup options={options[FS_LIST.SOURCE]} value={form.source_of_lead} onChange={set('source_of_lead')} labelledBy="fs-source_of_lead-label" invalid={!!errors.source_of_lead} />
        ))}
        {text('city', 'City')}
        {text('state', 'State', { list: 'fs-states' })}
        {chipField('visit_purpose', 'Purpose of Call / Visit', FS_LIST.PURPOSE, () => (
          <ChipGroup options={options[FS_LIST.PURPOSE]} value={form.visit_purpose} onChange={set('visit_purpose')} labelledBy="fs-visit_purpose-label" invalid={!!errors.visit_purpose} />
        ))}
        {text('lead_name', 'Lead Name')}
        {text('contact_number', 'Contact Number', { type: 'tel', inputMode: 'tel' })}
        {text('email_id', 'Email ID', { type: 'email', inputMode: 'email', className: 'sm:col-span-2' })}
        {text('current_gps_provider', 'Current GPS Provider')}
        {text('fleet_size', 'Fleet Size', { inputMode: 'numeric', pattern: '[0-9]*' })}
        {chipField('lead_stage', 'Lead Stage', FS_LIST.STAGE, () => (
          <ChipGroup options={options[FS_LIST.STAGE]} value={form.lead_stage} onChange={set('lead_stage')} labelledBy="fs-lead_stage-label" tone={leadStageTone} invalid={!!errors.lead_stage} />
        ))}
        <Field id="fs-demo_given" label="Demo Given" error={errors.demo_given} className="sm:col-span-2">
          <div id="fs-demo_given">
            <ChipGroup options={YES_NO} value={form.demo_given} onChange={set('demo_given')} labelledBy="fs-demo_given-label" invalid={!!errors.demo_given} />
          </div>
        </Field>
        {chipField('product_interested', 'Product Interested', FS_LIST.PRODUCT, () => (
          <CheckChips options={options[FS_LIST.PRODUCT]} value={form.product_interested} onChange={set('product_interested')} labelledBy="fs-product_interested-label" invalid={!!errors.product_interested} />
        ))}
        {text('expected_revenue', 'Expected Revenue (₹)', { inputMode: 'decimal', placeholder: 'e.g. 150000' })}
        {text('expected_amount_receiving_date', 'Expected Amount Receiving Date', { type: 'date' })}
      </div>

      <div className="flex gap-2.5 mt-3">
        <button
          type="button"
          onClick={submit}
          disabled={submitting || loading}
          className="flex-1 sm:flex-none sm:min-w-[240px] inline-flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl border-none bg-primary text-white font-extrabold text-[15px] disabled:opacity-60"
        >
          {submitting ? (
            <>
              <Icon name="loader" size={16} />
              Submitting…
            </>
          ) : (
            'Submit Entry'
          )}
        </button>
        <button type="button" onClick={onCancel} disabled={submitting} className="px-5 rounded-xl border border-border bg-transparent text-text-muted text-[14px] font-semibold disabled:opacity-60">
          Cancel
        </button>
      </div>

      <Toast toast={toast} onDismiss={() => setToast(null)} />

      <ManageListPopover
        anchorRef={manageAnchor}
        open={!!manage}
        onClose={() => setManageKey(null)}
        label={manage?.label ?? ''}
        items={manage ? lists?.[manage.type] || [] : []}
        onAdd={manageAdd}
        onSetActive={manageSetActive}
      />
    </div>
  )
}
