import { useEffect, useState } from 'react'
import { friendlyError, getSettings, setSetting } from '../../../lib/fieldSalesVisits'
import Icon from '../../shared/Icon'
import OverlayShell from '../../shared/OverlayShell'
import { BTN_GHOST, BTN_PRIMARY, INPUT } from './visitFormStyles'

// "Alert settings" (administrators: field_sales_form_manage_dropdowns) — where the Growth Director's alert goes. When a lead has had TWO visits without the demo
// (the Discovery counts as the first), the database queues an e-mail to this address. Read with fs_get_settings, saved with fs_set_setting (one valid
// address; the server normalises it to lower case). The message line is reserved, so nothing moves. Props: onClose(), onSaved(address).
const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/

export default function AlertSettingsModal({ onClose, onSaved }) {
  const [load, setLoad] = useState({ status: 'loading', saved: '', error: '' })
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState({ tone: '', text: '' })

  useEffect(() => {
    let cancelled = false
    getSettings()
      .then((s) => {
        if (cancelled) return
        const v = s?.director_alert_email || ''
        setLoad({ status: 'ready', saved: v, error: '' })
        setEmail(v)
      })
      .catch((e) => !cancelled && setLoad({ status: 'error', saved: '', error: friendlyError(e) }))
    return () => {
      cancelled = true
    }
  }, [])

  const typed = email.trim().toLowerCase()
  const changed = load.status === 'ready' && typed !== load.saved
  async function save() {
    if (saving) return
    if (!EMAIL_RE.test(typed) || typed.length > 200) {
      setMessage({ tone: 'error', text: 'Enter one valid e-mail address.' })
      return
    }
    setSaving(true)
    setMessage({ tone: '', text: '' })
    try {
      const out = await setSetting('director_alert_email', typed)
      setLoad({ status: 'ready', saved: out.value, error: '' })
      setEmail(out.value)
      setMessage({ tone: 'ok', text: 'Saved.' })
      onSaved?.(out.value)
    } catch (e) {
      setMessage({ tone: 'error', text: friendlyError(e) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <OverlayShell open onClose={onClose} maxWidth="max-w-md" closeIcon={<Icon name="x" size={16} />}>
      <div className="text-[16px] font-semibold text-text mb-1 pr-10">Alert settings</div>
      <div className="text-[12.5px] text-text-muted mb-4">When a lead has had two visits without the demo (the first Discovery counts as one), an e-mail goes to this address.</div>

      {load.status === 'loading' && (
        <div className="flex items-center gap-2 py-4 text-text-muted text-[13px]">
          <Icon name="loader" size={15} />
          Loading…
        </div>
      )}
      {load.status === 'error' && (
        <div role="alert" className="py-3 text-[13px] text-danger">
          Couldn&apos;t load the settings: {load.error}
        </div>
      )}
      {load.status === 'ready' && (
        <>
          <label htmlFor="fv-alert-email" className="block text-[12.5px] font-semibold text-text-muted mb-1">
            Growth Director alert e-mail
          </label>
          <input
            id="fv-alert-email"
            type="email"
            inputMode="email"
            autoComplete="off"
            value={email}
            maxLength={200}
            onChange={(e) => {
              setEmail(e.target.value)
              setMessage({ tone: '', text: '' })
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                save()
              }
            }}
            className={`${INPUT} ${message.tone === 'error' ? 'border-danger' : 'border-border'}`}
          />
          <div role="status" aria-live="polite" className={`min-h-[22px] pt-1 text-[12px] ${message.tone === 'error' ? 'font-semibold text-danger' : 'text-text-muted'}`} data-role="settings-message">
            {message.text}
          </div>
          <div className="flex gap-2.5 mt-2">
            <button type="button" onClick={save} disabled={saving || !changed} className={BTN_PRIMARY} data-role="settings-save">
              {saving ? (
                <>
                  <Icon name="loader" size={15} />
                  Saving…
                </>
              ) : (
                'Save'
              )}
            </button>
            <button type="button" onClick={onClose} disabled={saving} className={BTN_GHOST}>
              Close
            </button>
          </div>
        </>
      )}
    </OverlayShell>
  )
}
