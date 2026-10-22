import { useRef, useState } from 'react'
import { CLIENT_TYPE_OPTIONS, createEnquiry, emptyEnquiryForm, productOptions, statusOptions, validateEnquiryForm } from '../../../lib/enquiries'
import Icon from '../../shared/Icon'
import Td from '../../shared/table/Td'
import Tr from '../../shared/table/Tr'
import { DraftMultiSelectCell, DraftSelectCell, DraftTextCell } from '../../shared/table/InlineCells'
import { COL, managedOptions } from './enquirySheetLayout'

// A new, not-yet-saved enquiry typed straight into the sheet (replaces the old Add Entry form). Each draft
// row owns its own values, so several can be open at once and saved one by one. Nothing is sent until
// the save button (or Enter in a text cell); the discard button throws the row away. Date starts as today and Status as Open.
// Only Name, Phone and Date are required (as in the old form and the Excel rule) — a missing one outlines
// the cell and the message goes to the sheet's toast via onError. A failed save keeps what was typed.
//
// Props: label ("New row 2", prefixed to messages); selectable (an empty checkbox cell keeps the columns
// aligned); showChannel; dropdowns (managed lists, active values only are offered); onSaved(savedRow);
// onDiscard(); onError(text).
export default function EnquiryDraftRow({ label, selectable, showChannel, dropdowns, onSaved, onDiscard, onError, onManage }) {
  const [form, setForm] = useState(emptyEnquiryForm)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const busy = useRef(false) // synchronous double-submit guard (state lags a render)

  const set = (field) => (value) => {
    setForm((f) => ({ ...f, [field]: value }))
    setErrors((e) => (e[field] ? { ...e, [field]: undefined } : e))
  }

  async function save() {
    if (busy.current) return
    const found = validateEnquiryForm(form)
    setErrors(found)
    if (Object.keys(found).length) {
      onError(`${label}: ${Object.values(found).join(' ')}`)
      return
    }
    busy.current = true
    setSaving(true)
    try {
      onSaved(await createEnquiry(form))
    } catch (e) {
      onError(`${label}: ${e.message}`)
    } finally {
      busy.current = false
      setSaving(false)
    }
  }

  const text = (field, name, cls, extra = {}) => (
    <DraftTextCell value={form[field] ?? ''} onChange={set(field)} onEnter={save} invalid={!!errors[field]} ariaLabel={`${name}, ${label}`} className={cls} {...extra} />
  )
  const pick = (field, name, cls, options, placeholder) => (
    <DraftSelectCell value={form[field] ?? ''} onChange={set(field)} options={options} placeholder={placeholder} ariaLabel={`${name}, ${label}`} className={cls} />
  )

  return (
    <Tr zebra={false} className="h-9 bg-primary-tint/50">
      {selectable && <td className="px-2 py-2 w-8" />}
      <Td className={`${COL.details} text-center whitespace-nowrap`}>
        <button type="button" data-role="draft-save" onClick={save} disabled={saving} aria-label={`Save ${label}`} title="Save this row" className="inline-flex items-center justify-center w-5 h-5 rounded bg-transparent border-none text-primary hover:bg-surface disabled:opacity-50">
          <Icon name={saving ? 'loader' : 'check'} size={14} />
        </button>
        <button type="button" data-role="draft-discard" onClick={onDiscard} disabled={saving} aria-label={`Discard ${label}`} title="Discard this row" className="inline-flex items-center justify-center w-5 h-5 rounded bg-transparent border-none text-text-muted hover:text-danger hover:bg-surface disabled:opacity-50">
          <Icon name="x" size={13} />
        </button>
      </Td>
      {text('enquiry_date', 'Date', COL.date, { type: 'date' })}
      {text('name', 'Name', COL.name, { placeholder: 'Name *', autoFocus: true })}
      {text('company_name', 'Company', COL.company, { placeholder: 'Company' })}
      {text('phone', 'Phone', COL.phone, { placeholder: 'Phone *', inputMode: 'tel' })}
      {text('email', 'Email', COL.email, { placeholder: 'Email', type: 'email' })}
      <DraftMultiSelectCell
        value={form.requirement}
        onChange={set('requirement')}
        options={productOptions(dropdowns)}
        ariaLabel={`Requirement, ${label}`}
        title="Products"
        manage={onManage ? { label: 'Manage products', onClick: (el) => onManage('requirement', el) } : undefined}
        className={COL.requirement}
      />
      {pick('source', 'Source', COL.source, managedOptions(dropdowns?.source), 'Source')}
      {pick('sales_person_accountable', 'Sales person', COL.salesPerson, managedOptions(dropdowns?.sales_person), 'Sales person')}
      {pick('client_type', 'Client type', COL.clientType, CLIENT_TYPE_OPTIONS, 'Client type')}
      {pick('status', 'Status', COL.status, statusOptions(dropdowns), 'Status')}
      {showChannel && <Td className={`${COL.channel} text-text-muted`}>New</Td>}
      <Td className={`${COL.fms} text-text-muted`}>—</Td>
    </Tr>
  )
}
