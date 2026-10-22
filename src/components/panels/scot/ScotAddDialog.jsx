import { useState } from 'react'
import Icon from '../../shared/Icon'
import OverlayShell from '../../shared/OverlayShell'
import { ScotError, addScotClient, emptyScotForm, validateScotForm } from '../../../lib/scot'
import ScotFields from './ScotFields'

const BTN = 'inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg border border-border bg-transparent text-text-muted text-[12px] font-semibold hover:bg-surface-2 hover:text-text disabled:opacity-50'
const PRIMARY = '!bg-primary !text-white !border-primary'

// Add a contact to the follow-up list by hand. The phone number must not already be tracked: the database refuses a duplicate and says who has it (when the
// caller may see that client — then "Open it" jumps there). Everything else a rule says shows in place; any other failure goes to the module's toast.
// Props: onClose, onAdded(id) — the client was added, onOpenExisting(id) — open an existing client, notify(toast)
export default function ScotAddDialog({ onClose, onAdded, onOpenExisting, notify }) {
  const [form, setForm] = useState(emptyScotForm)
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [dup, setDup] = useState(null) // { message, existingId }

  const dirty = Object.values(form).some((v) => String(v).trim())
  const close = () => {
    if (busy) return
    if (dirty && !confirm('Discard this client?\n\nEverything you have typed so far will be lost.')) return
    onClose()
  }

  async function submit() {
    if (busy) return
    const found = validateScotForm(form)
    setErrors(found)
    setDup(null)
    if (Object.keys(found).length) return
    setBusy(true)
    try {
      const { id } = await addScotClient(form)
      notify({ tone: 'success', text: `${form.contact_name.trim()} was added to the follow-ups.` })
      onAdded(id)
    } catch (e) {
      if (e instanceof ScotError && e.code === 'duplicate') setDup({ message: e.message, existingId: e.existingId })
      else if (e instanceof ScotError && e.code === 'invalid') setErrors({ contact_name: e.message })
      else notify({ tone: 'error', text: e.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <OverlayShell open onClose={close} maxWidth="max-w-xl" closeIcon={<Icon name="x" size={16} />}>
      <div className="text-[16px] font-semibold text-text pr-10">Add a contact to follow up</div>
      <div className="text-[12.5px] text-text-muted mb-4">One live entry per phone number — the last 10 digits decide, however it is typed.</div>
      <ScotFields form={form} errors={errors} disabled={busy} onChange={(k, v) => setForm((f) => ({ ...f, [k]: v }))} />
      <div role="alert" data-role="error" className="min-h-[34px] text-[12px] leading-[17px] text-danger mb-2">
        {dup && (
          <span>
            {dup.message}.{' '}
            {dup.existingId && (
              <button type="button" data-role="open-existing" onClick={() => onOpenExisting(dup.existingId)} className="bg-transparent border-none p-0 underline text-primary font-semibold">
                Open it
              </button>
            )}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button type="button" data-role="add-client" disabled={busy} onClick={submit} className={`${BTN} ${PRIMARY} w-[130px]`}>
          <Icon name={busy ? 'loader' : 'check'} size={13} />
          {busy ? 'Adding…' : 'Add contact'}
        </button>
        <button type="button" disabled={busy} onClick={close} className={BTN}>
          Cancel
        </button>
      </div>
    </OverlayShell>
  )
}
