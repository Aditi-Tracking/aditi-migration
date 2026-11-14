import { useEffect, useMemo, useRef, useState } from 'react'
import {
  DEMO_OUTCOMES,
  FIELD_ORDER,
  FOLLOW_UP_REASONS,
  PURPOSES,
  QUOTATION_OUTCOMES,
  REASON_MAX,
  REMARKS_MAX,
  SOURCES,
  VisitApiError,
  YES_NO,
  activePainAreas,
  allowedReasonsFor,
  buildVisitPayload,
  currentUserId,
  emptyVisitForm,
  findByPhone,
  friendlyError,
  istDate,
  phoneDigits,
  normalizePhone10,
  searchLeads,
  submitVisit,
  uploadVisitPhoto,
  validateVisitForm,
  visibleFields,
} from '../../../lib/fieldSalesVisits'
import { ChipGroup } from '../../shared/ChipGroup'
import Icon from '../../shared/Icon'
import Toast from '../../shared/Toast'
import AdoptConfirm from './AdoptConfirm'
import LeadPicker from './LeadPicker'
import PainAreaManager from './PainAreaManager'
import PhotoCapture from './PhotoCapture'
import { BTN_GHOST, BTN_PRIMARY, INPUT } from './visitFormStyles'
import { Field, Notice, Section } from './VisitFormParts'
import { usePhotoCapture } from './usePhotoCapture'

// The Field Sales Visit Form (new model: leads + visits — see lib/fieldSalesVisits.js), shown in the leads table's "New Visit" modal.
// One form, driven by the answers: Purpose first; Discovery asks for the source and the business, a Follow-up asks for the existing lead and why; the demo
// question follows (Discovery and Demo pending land on it, a Quotation follow-up skips it); then the outcome branches; then the photo + location; then Submit.
// Which fields apply is lib `visibleFields` — the form renders from it, so a field that stops applying is simply not there and is never sent (what was typed
// into it is kept in case the rep switches back). A visit is COMPLETED when the demo was given (or it is a quotation follow-up); "demo not given" is a
// PENDING visit and says so before it is saved.
// The phone number is checked as it is typed (fs_find_by_phone, after a pause): none / own_lead / adoptable / taken — see the notices. The server decides
// again on submit; its "already in your pipeline" refusal (23505, detail adoptable:<source>) opens the same confirmation.
// The photo is uploaded to the private bucket (the user's own folder) BEFORE the visit is saved; a retry reuses the already-uploaded file.
// Messages are toasts or reserved lines (nothing moves); a failed submit keeps everything typed. Props: painAreas ([{id, value, is_active}] | null while loading),
// painError, onPainChanged() (force refetch, never rejects), canManage (Manage next to Pain area), presetLead (a lead row from the list: opens as a follow-up on it),
// onSaved(result), onCancel(), onDirtyChange(bool).
const PHONE_DEBOUNCE_MS = 500
const SOURCE_LABEL = { enquiry: 'your enquiry in the Enquiry Capture Sheet', scot: 'your contact in SCOT Calls' }

function initialForm(preset) {
  const f = emptyVisitForm()
  if (!preset) return f
  return { ...f, purpose: 'Follow-up', lead_id: preset.lead_id, follow_up_reason: preset.allowed_reasons?.[0] || '' }
}

export default function VisitForm({ painAreas, painError, onPainChanged, canManage, presetLead = null, onSaved, onCancel, onDirtyChange }) {
  const [preset] = useState(() => (presetLead ? { ...presetLead, allowed_reasons: presetLead.allowed_reasons || allowedReasonsFor(presetLead.completed_count || 0) } : null))
  const [form, setForm] = useState(() => initialForm(preset))
  const [lead, setLead] = useState(preset) // the chosen existing lead (a Follow-up)
  const [errors, setErrors] = useState({})
  const [toast, setToast] = useState(null)
  const [stage, setStage] = useState('') // '' | 'uploading' | 'saving'
  const [adopt, setAdopt] = useState(null) // { source, info } — the confirmation dialog
  const [adoptFor, setAdoptFor] = useState('') // the phone key the rep has confirmed adopting
  const [manageEl, setManageEl] = useState(null)
  const [manageOpen, setManageOpen] = useState(false)
  const manageAnchor = useMemo(() => ({ current: manageEl }), [manageEl])
  const { photo, pick, retry, clear } = usePhotoCapture()
  const busy = useRef(false) // synchronous double-tap guard (state lags a render)
  const uploaded = useRef(null) // { blob, path } — the photo already in the bucket, reused by a retry
  const [pristine] = useState(() => JSON.stringify(initialForm(preset)))
  const submitting = stage !== ''
  const dirty = JSON.stringify(form) !== pristine || photo.status !== 'empty'

  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])

  const v = useMemo(() => visibleFields(form), [form])
  const painOptions = useMemo(() => activePainAreas(painAreas), [painAreas])
  const painLoading = painAreas === null && !painError

  // ── the phone check ──
  const phoneKey = form.purpose === 'Discovery' ? normalizePhone10(form.contact_number) : ''
  const phoneBad = form.purpose === 'Discovery' && phoneDigits(form.contact_number).length >= 11 && !phoneKey // too long to be a number: say so while typing
  const [phoneRes, setPhoneRes] = useState({ key: '', data: null, error: '' })
  const [phoneNonce, setPhoneNonce] = useState(0)
  const typed = form.contact_number
  useEffect(() => {
    if (!phoneKey) return
    let cancelled = false
    const t = setTimeout(() => {
      findByPhone(typed)
        .then((data) => {
          if (cancelled) return
          setPhoneRes({ key: phoneKey, data, error: '' })
          // the rep's OWN contact: fill what is still empty from it (they can still change it)
          if (data.match === 'adoptable') {
            setForm((f) => ({ ...f, business_name: f.business_name || data.company || '', contact_person: f.contact_person || data.name || '', city: f.city || data.city || '' }))
          }
        })
        .catch((e) => !cancelled && setPhoneRes({ key: phoneKey, data: null, error: friendlyError(e) }))
    }, PHONE_DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [phoneKey, typed, phoneNonce])
  const checking = !!phoneKey && phoneRes.key !== phoneKey
  const match = !phoneKey || checking ? null : phoneRes.data
  const phoneError = !phoneKey || checking ? '' : phoneRes.error
  const adoptConfirmed = match?.match === 'adoptable' && adoptFor === phoneKey
  const recheckPhone = () => {
    setPhoneRes({ key: '', data: null, error: '' })
    setPhoneNonce((n) => n + 1)
  }

  const set = (field) => (value) => {
    setForm((f) => ({ ...f, [field]: value }))
    setErrors((e) => (e[field] ? { ...e, [field]: undefined } : e))
  }
  function setPurpose(p) {
    set('purpose')(p)
  }

  function focusField(key) {
    const el = document.getElementById(`fv-${key}`)
    if (!el) return
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    const target = el.matches('input,select,textarea') ? el : el.querySelector('button:not([disabled]),input:not([type=hidden])')
    target?.focus({ preventScroll: true })
  }
  // Enter on a text field = "Next" (a phone's Next key); it never submits.
  function onEnter(e, key) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const at = FIELD_ORDER.indexOf(key)
    for (const k of FIELD_ORDER.slice(at + 1)) {
      const el = v.has(k) && document.getElementById(`fv-${k}`)
      if (el && el.matches('input,textarea')) {
        el.focus()
        return
      }
    }
    e.currentTarget.blur()
  }

  // ── an existing lead (Follow-up) ──
  function chooseLead(row) {
    setLead(row)
    const allowed = row?.allowed_reasons || []
    setForm((f) => ({ ...f, lead_id: row?.lead_id || '', follow_up_reason: allowed.length === 1 ? allowed[0] : '' }))
    setErrors((e) => ({ ...e, lead_id: undefined, follow_up_reason: undefined }))
  }
  // "This number is already your lead": go to Follow-up on it.
  async function switchToFollowUp(own) {
    try {
      const rows = await searchLeads(own.business_name || phoneDigits(form.contact_number))
      const row = rows.find((r) => r.lead_id === own.lead_id)
      if (!row) throw new Error("Couldn't open that lead — search for it under Follow-up.")
      setLead(row)
      setForm((f) => ({ ...f, purpose: 'Follow-up', lead_id: row.lead_id, follow_up_reason: row.allowed_reasons?.length === 1 ? row.allowed_reasons[0] : '', demo_given: '', demo_outcome: '' }))
      setErrors({})
    } catch (e) {
      setToast({ tone: 'error', text: friendlyError(e) })
    }
  }

  // ── submit ──
  async function submit(forceAdopt = false) {
    if (busy.current) return
    const found = validateVisitForm(form, { painAreas: painAreas ? painOptions.map((o) => o.value) : undefined })
    if (v.has('contact_number') && !found.contact_number) {
      if (match?.match === 'own_lead') found.contact_number = 'This number is already your lead — log a follow-up on it instead.'
      else if (match?.match === 'taken') found.contact_number = 'This number is already in the system.'
      else if (match?.match === 'adoptable' && !adoptConfirmed && !forceAdopt) found.contact_number = 'This is your existing lead — tick the box below to log the visit against it.'
      else if (checking) found.contact_number = 'Checking the number — one moment.'
    }
    if (photo.status === 'processing') found.attachment = 'The photo is still being prepared — one moment.'
    else if (photo.status === 'error') found.attachment = photo.error
    else if (photo.status !== 'ready') found.attachment = 'Take a photo or choose an image — it is required.'
    setErrors(found)
    const firstBad = FIELD_ORDER.find((k) => found[k])
    if (firstBad) {
      const n = Object.keys(found).length
      setToast({ tone: 'error', text: `Please fix the ${n === 1 ? 'highlighted field' : `${n} highlighted fields`}.` })
      focusField(firstBad)
      return
    }
    busy.current = true
    setToast(null)
    try {
      let path = uploaded.current?.blob === photo.blob ? uploaded.current.path : null
      if (!path) {
        setStage('uploading')
        path = await uploadVisitPhoto(photo.blob, await currentUserId())
        uploaded.current = { blob: photo.blob, path }
      }
      setStage('saving')
      const result = await submitVisit(
        buildVisitPayload(form, {
          adopt: adoptConfirmed || forceAdopt,
          attachment_path: path,
          geo_lat: photo.geo.lat,
          geo_lng: photo.geo.lng,
          geo_accuracy_m: photo.geo.accuracy,
          captured_at: photo.geo.at,
        }),
      )
      onSaved?.(result, form)
    } catch (e) {
      if (e instanceof VisitApiError && e.code === '23505') {
        if (e.adoptSource) {
          let info = match?.match === 'adoptable' ? match : null
          if (!info) {
            try {
              const r = await findByPhone(form.contact_number)
              if (r.match === 'adoptable') info = r
            } catch {
              /* the dialog still works without the details */
            }
          }
          setAdopt({ source: e.adoptSource, info })
        } else {
          setToast({ tone: 'error', text: e.detail ? 'You already have a lead on this number — log a follow-up on it instead.' : 'This number is already in the system.' })
          recheckPhone()
        }
      } else {
        setToast({ tone: 'error', text: friendlyError(e) })
      }
    } finally {
      busy.current = false
      setStage('')
    }
  }

  function confirmAdopt() {
    setAdoptFor(phoneKey)
    setAdopt(null)
    submit(true)
  }

  // ── Pain area: Manage (add / remove / restore / rename) — PainAreaManager; a retired or renamed value that is picked right now follows it ──
  const manageLink =
    canManage && painAreas ? (
      <button
        type="button"
        aria-label="Manage Pain area"
        onClick={(e) => {
          setManageEl(e.currentTarget)
          setManageOpen(true)
        }}
        className="inline-flex items-center gap-1 text-[12px] font-semibold text-primary bg-transparent border-none px-1 py-0.5"
      >
        <Icon name="settings" size={13} />
        Manage
      </button>
    ) : null

  // ── field builders ──
  const text = (key, label, extra = {}) => {
    const { className, hint, required = true, ...inputProps } = extra
    return (
      <Field id={`fv-${key}`} label={label} required={required} error={errors[key]} hint={hint} className={className}>
        <input
          id={`fv-${key}`}
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
  const area = (key, label, max, extra = {}) => (
    <Field id={`fv-${key}`} label={label} required={extra.required !== false} error={errors[key]} hint={extra.hint ?? `${form[key].length}/${max}`} className="sm:col-span-2">
      <textarea
        id={`fv-${key}`}
        rows={extra.rows || 3}
        maxLength={max + 50}
        value={form[key]}
        onChange={(e) => set(key)(e.target.value)}
        aria-invalid={!!errors[key] || undefined}
        placeholder={extra.placeholder}
        className={`${INPUT} resize-y min-h-[84px] ${errors[key] ? 'border-danger' : 'border-border'}`}
      />
    </Field>
  )
  const chips = (key, label, options, extra = {}) => (
    <Field id={`fv-${key}`} label={label} error={errors[key]} hint={extra.hint} className="sm:col-span-2" extra={extra.extra}>
      <div id={`fv-${key}`}>
        <ChipGroup options={options} value={form[key]} onChange={extra.onChange || set(key)} labelledBy={`fv-${key}-label`} invalid={!!errors[key]} tone={extra.tone} />
      </div>
    </Field>
  )
  const tomorrow = istDate(1)
  const today = istDate(0)

  const completedNow = form.demo_given === 'yes' || form.follow_up_reason === 'Quotation follow-up'
  const pendingNow = form.demo_given === 'no'
  const reasonOptions = lead ? FOLLOW_UP_REASONS.filter((r) => (lead.allowed_reasons || []).includes(r.value)) : FOLLOW_UP_REASONS
  const discovery = form.purpose === 'Discovery'

  return (
    <div>
      <Section title="Visit">
        {chips('purpose', 'Purpose of visit', PURPOSES, { onChange: setPurpose })}
      </Section>

      {discovery && (
        <>
          <Section title="Source">
            {chips('source_of_lead', 'Source of lead', SOURCES)}
            {v.has('referrer_name') && text('referrer_name', 'Referrer name', { className: 'sm:col-span-2', maxLength: 200 })}
            {chips('coordinator_booked', 'Meeting booked by Sales Coordinator?', YES_NO)}
          </Section>

          <Section title="Business and contact">
            {text('business_name', 'Business name', { maxLength: 200 })}
            {text('contact_person', 'Contact person', { maxLength: 200 })}
            <div className="sm:col-span-2">
              {text('contact_number', 'Contact number', { type: 'tel', inputMode: 'tel', maxLength: 30, hint: !phoneKey ? '10 digits (a +91 or a leading 0 is fine). Checked against existing leads as you type.' : undefined })}
              <div aria-live="polite" data-role="phone-status" className="min-h-[18px] -mt-0.5 mb-1 text-[12px] leading-[16px]">
                {phoneBad && (
                  <span className="text-danger font-semibold" data-role="phone-bad">
                    A contact number is exactly 10 digits.
                  </span>
                )}
                {checking && (
                  <span className="inline-flex items-center gap-1.5 text-text-muted">
                    <Icon name="loader" size={12} />
                    Checking the number…
                  </span>
                )}
                {!checking && phoneError && <span className="text-text-muted">Couldn&apos;t check the number just now — it is checked again when you submit.</span>}
                {!checking && match?.match === 'none' && (
                  <span className="inline-flex items-center gap-1 text-[#16A34A] font-semibold">
                    <Icon name="check" size={12} strokeWidth={3} />
                    New number
                  </span>
                )}
              </div>
              {match?.match === 'taken' && (
                <Notice tone="danger" title="This number is already in the system" className="mb-2">
                  It can&apos;t be used for a new lead. Check the number, or ask your manager.
                </Notice>
              )}
              {match?.match === 'own_lead' && (
                <Notice tone="warn" title="This number is already your lead" className="mb-2">
                  <div className="break-words">{[match.business_name, match.contact_person, match.city].filter(Boolean).join(' · ')}</div>
                  <div className="mt-1.5">A new Discovery visit isn&apos;t possible for it.</div>
                  <button type="button" onClick={() => switchToFollowUp(match)} className={`${BTN_PRIMARY} mt-2 !py-2 !px-3.5 !text-[13px]`} data-role="to-followup">
                    Log a follow-up on it instead
                  </button>
                </Notice>
              )}
              {match?.match === 'adoptable' && (
                <Notice tone="info" title={`This number is already ${SOURCE_LABEL[match.source] || 'in your pipeline'}`} className="mb-2">
                  <div className="break-words">{[match.name, match.company, match.city].filter(Boolean).join(' · ')}</div>
                  <label className="mt-2 flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={adoptConfirmed}
                      onChange={(e) => setAdoptFor(e.target.checked ? phoneKey : '')}
                      className="mt-0.5 w-[18px] h-[18px] accent-[var(--color-primary)]"
                      data-role="adopt-check"
                    />
                    <span className="text-[13px]">Yes, log this visit against my existing lead{match.source === 'enquiry' ? ' (no new enquiry is created)' : ''}.</span>
                  </label>
                </Notice>
              )}
            </div>
            {text('area', 'Area', { maxLength: 200 })}
            {text('city', 'City', { maxLength: 100 })}
            {text('fleet_size', 'Fleet size', { inputMode: 'numeric', pattern: '[0-9]*' })}
            {chips('uses_gps', 'Using any GPS today?', YES_NO)}
            {v.has('existing_gps') && text('existing_gps', 'Existing GPS name or service', { className: 'sm:col-span-2', maxLength: 200 })}
            <Field id="fv-pain_area" label="Pain area of the customer" error={errors.pain_area} extra={manageLink} className="sm:col-span-2">
              <div id="fv-pain_area">
                {painLoading ? (
                  <div className="text-[13px] text-text-muted py-2">Loading options…</div>
                ) : painError && painAreas === null ? (
                  <div className="text-[13px] text-danger py-2">
                    Couldn&apos;t load the options ({painError}).
                    <button type="button" onClick={() => onPainChanged()} className="ml-2 underline bg-transparent border-none text-danger font-bold">
                      Retry
                    </button>
                  </div>
                ) : !painOptions.length ? (
                  <div className="text-[13px] text-text-muted py-2">No options yet{canManage ? ' — use Manage to add some.' : ' — ask an admin to add some.'}</div>
                ) : (
                  <ChipGroup options={painOptions} value={form.pain_area} onChange={set('pain_area')} labelledBy="fv-pain_area-label" invalid={!!errors.pain_area} />
                )}
              </div>
            </Field>
          </Section>
        </>
      )}

      {form.purpose === 'Follow-up' && (
        <Section title="Existing lead">
          <Field id="fv-lead_id" label="Existing lead" error={errors.lead_id} hint="Your own open leads only." className="sm:col-span-2">
            <LeadPicker value={lead} onChange={chooseLead} invalid={!!errors.lead_id} />
          </Field>
          {v.has('follow_up_reason') &&
            chips('follow_up_reason', 'Follow-up reason', reasonOptions, {
              hint: form.follow_up_reason === 'Demo pending' ? 'The demo has not been recorded for this lead yet.' : form.follow_up_reason === 'Quotation follow-up' ? 'The demo is already done for this lead.' : undefined,
            })}
        </Section>
      )}

      {v.has('demo_given') && (
        <Section title="Demo">
          {chips('demo_given', 'Demo given?', YES_NO)}
          {v.has('demo_outcome') && chips('demo_outcome', 'Demo outcome', DEMO_OUTCOMES)}
          {v.has('quotation_due_date') && (
            <Field id="fv-quotation_due_date" label="Quotation send date" error={errors.quotation_due_date} hint="Today or later." className="sm:col-span-2">
              <input id="fv-quotation_due_date" type="date" min={today} value={form.quotation_due_date} onChange={(e) => set('quotation_due_date')(e.target.value)} aria-invalid={!!errors.quotation_due_date || undefined} className={`${INPUT} sm:max-w-[260px] ${errors.quotation_due_date ? 'border-danger' : 'border-border'}`} />
            </Field>
          )}
          {v.has('closing_reason') && form.demo_outcome === 'not_interested' && area('closing_reason', 'Reason for not interested', REASON_MAX)}
          {v.has('no_demo_reason') && area('no_demo_reason', 'Reason the demo was not given', REASON_MAX)}
          {v.has('next_followup_date') && form.demo_given === 'no' && (
            <Field id="fv-next_followup_date" label="Next follow-up date for the demo" error={errors.next_followup_date} hint="A future date." className="sm:col-span-2">
              <input id="fv-next_followup_date" type="date" min={tomorrow} value={form.next_followup_date} onChange={(e) => set('next_followup_date')(e.target.value)} aria-invalid={!!errors.next_followup_date || undefined} className={`${INPUT} sm:max-w-[260px] ${errors.next_followup_date ? 'border-danger' : 'border-border'}`} />
            </Field>
          )}
        </Section>
      )}

      {v.has('quotation_outcome') && (
        <Section title="Quotation follow-up">
          {chips('quotation_outcome', 'Outcome', QUOTATION_OUTCOMES)}
          {v.has('so_number') && text('so_number', 'SO number', { maxLength: 40 })}
          {v.has('won_amount') && text('won_amount', 'Order amount (₹)', { inputMode: 'decimal', placeholder: 'e.g. 150000' })}
          {v.has('closing_reason') && form.quotation_outcome === 'lost' && area('closing_reason', 'Reason for loss', REASON_MAX)}
          {v.has('quotation_followup_reason') && area('quotation_followup_reason', 'Reason for the next follow-up', REASON_MAX)}
          {v.has('next_followup_date') && form.quotation_outcome === 'next_followup' && (
            <Field id="fv-next_followup_date" label="Next follow-up date" error={errors.next_followup_date} hint="A future date." className="sm:col-span-2">
              <input id="fv-next_followup_date" type="date" min={tomorrow} value={form.next_followup_date} onChange={(e) => set('next_followup_date')(e.target.value)} aria-invalid={!!errors.next_followup_date || undefined} className={`${INPUT} sm:max-w-[260px] ${errors.next_followup_date ? 'border-danger' : 'border-border'}`} />
            </Field>
          )}
        </Section>
      )}

      {form.purpose && (
        <Section title="Attachment">
          {area('remarks', 'Remarks', REMARKS_MAX, { required: false, rows: 2, placeholder: 'Optional — anything else worth knowing (for example what "Other" means for the pain area).', hint: undefined })}
          <PhotoCapture photo={photo} onPick={pick} onRetry={retry} onClear={clear} error={photo.status === 'ready' || photo.status === 'processing' ? '' : errors.attachment} disabled={submitting} />
        </Section>
      )}

      {form.purpose && (
        <div className="mt-3">
          {pendingNow && (
            <Notice tone="warn" className="mb-3">
              {discovery ? (
                <>
                  <b>Demo not given.</b> This Discovery still counts as a meeting and the lead goes to Sales FMS now; the demo is planned for your follow-up date.
                </>
              ) : (
                <>
                  <b>Demo still not given.</b> This follow-up is not an extra meeting. After two visits without the demo, the Growth Director is notified.
                </>
              )}
            </Notice>
          )}
          {completedNow && !pendingNow && form.follow_up_reason !== 'Quotation follow-up' && (
            <div className="text-[12.5px] text-text-muted mb-3">
              {discovery ? 'This visit counts as a meeting and the lead goes to Sales FMS.' : 'The demo is recorded in Sales FMS. This follow-up is not an extra meeting.'}
            </div>
          )}
          <div className="flex gap-2.5">
            <button type="button" onClick={() => submit(false)} disabled={submitting} className={`${BTN_PRIMARY} flex-1 sm:flex-none sm:min-w-[240px] !py-3.5 !text-[15px] !px-6`} data-role="submit">
              {submitting ? (
                <>
                  <Icon name="loader" size={16} />
                  {stage === 'uploading' ? 'Uploading photo…' : 'Saving visit…'}
                </>
              ) : (
                'Submit Visit'
              )}
            </button>
            <button type="button" onClick={onCancel} disabled={submitting} className={BTN_GHOST}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <Toast toast={toast} onDismiss={() => setToast(null)} />
      <AdoptConfirm open={!!adopt} source={adopt?.source} info={adopt?.info} busy={submitting} onConfirm={confirmAdopt} onCancel={() => setAdopt(null)} />
      <PainAreaManager
        anchorRef={manageAnchor}
        open={manageOpen}
        onClose={() => setManageOpen(false)}
        items={painAreas}
        onChanged={onPainChanged}
        onRetired={(value) => setForm((f) => (f.pain_area === value ? { ...f, pain_area: '' } : f))}
        onRenamed={(oldName, newName) => setForm((f) => (f.pain_area === oldName ? { ...f, pain_area: newName } : f))}
      />
    </div>
  )
}
