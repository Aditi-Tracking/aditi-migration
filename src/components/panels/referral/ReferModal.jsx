import { useEffect, useState } from 'react'
import { useAuth } from '../../../context/AuthContext'
import { SB_HDRS, SUPABASE_ANON, SUPABASE_URL, getAuthToken } from '../../../lib/supabaseClient'
import OverlayShell from '../../shared/OverlayShell'
import FormField from './FormField'

const inputClass =
  'w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[12.5px] text-text outline-none focus:border-primary'

// Ported from old-portal/js/referral.js's openReferModal/submitReferralForm
// exactly — same validation order, same resume-upload-then-insert flow, same
// referrals row shape. `opening` is { id, title } or null.
export default function ReferModal({ opening, onClose, onSubmitted }) {
  const { currentUser } = useAuth()
  const [name, setName] = useState('')
  const [mobile, setMobile] = useState('')
  const [email, setEmail] = useState('')
  const [city, setCity] = useState('')
  const [file, setFile] = useState(null)
  const [status, setStatus] = useState(null) // { text, kind } | null
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!opening) return
    // Reset the form fresh each time the modal opens for a (possibly
    // different) opening — it stays mounted between opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName('')
    setMobile('')
    setEmail('')
    setCity('')
    setFile(null)
    setStatus(null)
    setSubmitting(false)
  }, [opening])

  if (!opening) return null

  async function handleSubmit(e) {
    e.preventDefault()
    const trimmedName = name.trim()
    const trimmedMobile = mobile.trim()
    const trimmedEmail = email.trim()
    const trimmedCity = city.trim()

    if (!trimmedName || !trimmedMobile || !trimmedEmail || !trimmedCity) {
      setStatus({ text: '⚠️ Please fill in all fields.', kind: 'danger' })
      return
    }
    if (!/^[0-9]{10}$/.test(trimmedMobile.replace(/\D/g, ''))) {
      setStatus({ text: '⚠️ Please enter a valid 10-digit mobile number.', kind: 'danger' })
      return
    }
    if (!/^\S+@\S+\.\S+$/.test(trimmedEmail)) {
      setStatus({ text: '⚠️ Please enter a valid email address.', kind: 'danger' })
      return
    }
    if (!file) {
      setStatus({ text: "⚠️ Please attach the candidate's resume.", kind: 'danger' })
      return
    }
    if (!currentUser) {
      setStatus({ text: '⚠️ Please log in again.', kind: 'danger' })
      return
    }
    if (!currentUser.empId) {
      setStatus({ text: '⚠️ Could not find your Employee ID. Please refresh the page and try again.', kind: 'danger' })
      return
    }

    setSubmitting(true)
    setStatus({ text: '⏳ Submitting referral…', kind: 'warn' })

    let resumeUploadError = null
    try {
      let resumeUrl = null
      const ext = (file.name.split('.').pop() || 'pdf').toLowerCase()
      const safeName = trimmedName.replace(/[^a-z0-9]/gi, '_').toLowerCase()
      const filePath = `${opening.id}/${Date.now()}_${safeName}.${ext}`
      const bucket = 'referral_resumes'

      setStatus({ text: '⏳ Uploading resume…', kind: 'warn' })
      const token = getAuthToken()
      const upRes = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${filePath}`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON,
          Authorization: `Bearer ${token}`,
          'Content-Type': file.type || 'application/octet-stream',
          'x-upsert': 'true',
        },
        body: file,
      })
      if (upRes.ok) {
        resumeUrl = `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${filePath}`
      } else {
        resumeUploadError = (await upRes.text()) || `Resume upload failed (${upRes.status})`
      }

      setStatus({ text: '⏳ Submitting referral…', kind: 'warn' })

      const payload = {
        opening_id: opening.id ? Number(opening.id) : null,
        opening_title: opening.title,
        referrer_emp_id: currentUser.empId,
        referrer_name: currentUser.name || '',
        referrer_email: currentUser.email || '',
        referrer_dept: currentUser.rawRole || '',
        referrer_branch: currentUser.location || '',
        candidate_name: trimmedName,
        candidate_mobile: trimmedMobile,
        candidate_email: trimmedEmail,
        candidate_city: trimmedCity,
        resume_url: resumeUrl,
        is_friend_declared: true,
        status: 'Submitted',
      }

      const res = await fetch(`${SUPABASE_URL}/rest/v1/referrals`, {
        method: 'POST',
        headers: { ...SB_HDRS(), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const t = await res.text()
        throw new Error(t || `Could not save referral (${res.status})`)
      }

      if (resumeUploadError) {
        setStatus({ text: '⚠️ Referral submitted, but resume upload failed: ' + resumeUploadError, kind: 'warn' })
      } else {
        setStatus({ text: '✅ Referral submitted! You will be notified as it progresses.', kind: 'success' })
      }
      onSubmitted()
      setTimeout(onClose, resumeUploadError ? 3500 : 1400)
    } catch (e) {
      setStatus({ text: '❌ ' + e.message, kind: 'danger' })
      setSubmitting(false)
    }
  }

  const statusClass =
    status?.kind === 'danger'
      ? 'bg-danger-tint text-danger'
      : status?.kind === 'success'
        ? 'bg-primary-tint text-primary'
        : 'bg-surface-2 text-text-muted'

  return (
    <OverlayShell open={!!opening} onClose={onClose} maxWidth="max-w-md">
      <div className="mb-4 pr-8">
        <div className="text-[15px] font-semibold text-text">🤝 Refer a Friend</div>
        <div className="text-[12px] text-text-muted mt-0.5">
          for <span className="text-primary font-medium">{opening.title}</span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
        <FormField label="Candidate Name">
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className={inputClass} />
        </FormField>
        <div className="flex gap-3">
          <FormField label="Mobile Number" className="flex-1">
            <input
              type="tel"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              placeholder="10-digit mobile"
              className={inputClass}
            />
          </FormField>
          <FormField label="Email" className="flex-1">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="candidate@email.com"
              className={inputClass}
            />
          </FormField>
        </div>
        <FormField label="City">
          <input type="text" value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Mumbai" className={inputClass} />
        </FormField>
        <FormField label="Resume">
          <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-surface-2 px-3 py-2.5">
            <input
              type="file"
              accept=".pdf,.doc,.docx"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="flex-1 text-[12px] text-text-muted"
            />
          </div>
          <div className="text-[10.5px] text-text-muted mt-1">PDF or Word document</div>
        </FormField>

        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-primary text-white text-[13px] font-medium py-2.5 disabled:opacity-60"
        >
          Submit Referral
        </button>
        {status && <div className={`rounded-md px-3 py-2 text-[12px] font-medium text-center ${statusClass}`}>{status.text}</div>}
      </form>
    </OverlayShell>
  )
}
