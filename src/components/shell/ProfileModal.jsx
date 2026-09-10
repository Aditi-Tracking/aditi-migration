import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { fetchFullEmployeeProfile, uploadProfilePhoto } from '../../lib/employeeProfile'

function fmtDate(d) {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return d
  }
}

export default function ProfileModal({ open, onClose }) {
  const { currentUser, updateAvatarUrl } = useAuth()
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')
  const [row, setRow] = useState(null)
  const [uploadStatus, setUploadStatus] = useState({ text: '', danger: false })
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (!open || !currentUser) return
    let cancelled = false
    // Reset the previous fetch's result before starting a new one (the modal
    // stays mounted between opens, so stale data/error text must not flash).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setErrorMsg('')
    setRow(null)
    setUploadStatus({ text: '', danger: false })

    const name = currentUser.name || 'User'
    const email = String(currentUser.email || '').trim()

    fetchFullEmployeeProfile(name, email)
      .then((r) => {
        if (cancelled) return
        setLoading(false)
        if (r) {
          setRow(r)
          if (r.avatar_url) updateAvatarUrl(r.avatar_url)
        } else {
          setErrorMsg(`Record not found. (Name: "${name}"${email ? `, Email: ${email}` : ''}) — Please contact MIS.`)
        }
      })
      .catch(() => {
        if (cancelled) return
        setLoading(false)
        setErrorMsg('Network error.')
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, currentUser?.email])

  if (!open) return null

  const displayName = row?.Employee_name || currentUser?.name || 'User'
  const displayDept = row?.Employee_Dept || row?.Emp_Dept || currentUser?.rawRole || '—'
  const photoUrl = row?.avatar_url || row?.Link || row?.link || row?.Photo || currentUser?.avatar_url || null

  async function handlePhotoChange(e) {
    const file = e.target.files && e.target.files[0]
    if (!file) return
    e.target.value = ''

    if (!file.type.startsWith('image/')) {
      setUploadStatus({ text: '❌ Please select an image file only.', danger: true })
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadStatus({ text: '❌ File must be smaller than 5MB.', danger: true })
      return
    }

    const email = String(currentUser.email || '').trim().toLowerCase()
    if (!email) {
      setUploadStatus({ text: '❌ Email not found.', danger: true })
      return
    }

    setUploadStatus({ text: '⏳ Uploading...', danger: false })
    try {
      const avatarUrl = await uploadProfilePhoto(email, file)
      updateAvatarUrl(avatarUrl)
      setRow((r) => (r ? { ...r, avatar_url: avatarUrl } : r))
      setUploadStatus({ text: '✅ Photo updated successfully!', danger: false })
    } catch (err) {
      setUploadStatus({ text: '❌ ' + (err.message || 'Upload failed. Please try again.'), danger: true })
    }
  }

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 bg-black/55 z-[70]" />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[71] w-[min(400px,92vw)] max-h-[88vh] overflow-y-auto rounded-2xl bg-surface border border-border shadow-2xl">
        <div className="relative bg-primary rounded-t-2xl px-5 pt-7 pb-5 text-center">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3.5 right-3.5 w-7 h-7 rounded-md bg-white/15 border border-white/25 text-white flex items-center justify-center text-[13px]"
          >
            ✕
          </button>

          <div className="relative w-20 h-20 mx-auto mb-3">
            <div className="w-20 h-20 rounded-full border-[3px] border-white/70 overflow-hidden bg-white/10 flex items-center justify-center text-[26px] font-semibold text-white">
              {photoUrl ? (
                <img src={photoUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                displayName.charAt(0).toUpperCase()
              )}
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Update photo"
              className="absolute bottom-0 right-0 w-[26px] h-[26px] rounded-full bg-white border-2 border-primary flex items-center justify-center"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
          </div>

          {uploadStatus.text && (
            <div className={`text-[11px] -mt-1 mb-1.5 ${uploadStatus.danger ? 'text-red-200' : 'text-white/90'}`}>
              {uploadStatus.text}
            </div>
          )}

          <div className="text-[16px] font-semibold text-white">{loading ? 'Loading...' : displayName}</div>
          <div className="text-[11px] text-white/80 mt-1 inline-block bg-white/15 px-3 py-0.5 rounded-full border border-white/25">
            {loading ? '—' : displayDept.charAt(0).toUpperCase() + displayDept.slice(1)}
          </div>
        </div>

        <div className="px-5 pt-4 pb-6">
          {loading && (
            <div className="text-center py-4 text-text-muted text-[13px]">⏳ Loading details...</div>
          )}

          {!loading && row && (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 rounded-lg border border-border bg-surface-2 px-3 py-2">
                <div className="text-[10.5px] font-medium text-text-muted uppercase tracking-wide">📧 Email</div>
                <div className="text-[13px] text-text mt-0.5">{row['Email_Id'] || row['Email'] || '—'}</div>
              </div>
              <div className="rounded-lg border border-border bg-surface-2 px-3 py-2">
                <div className="text-[10.5px] font-medium text-text-muted uppercase tracking-wide">📞 Phone</div>
                <div className="text-[13px] text-text mt-0.5">{row['Phone Number'] || row['Phone_Number'] || '—'}</div>
              </div>
              <div className="rounded-lg border border-border bg-surface-2 px-3 py-2">
                <div className="text-[10.5px] font-medium text-text-muted uppercase tracking-wide">📍 Location</div>
                <div className="text-[13px] text-text mt-0.5">{row['Location'] || row['location'] || '—'}</div>
              </div>
              <div className="rounded-lg border border-border bg-surface-2 px-3 py-2">
                <div className="text-[10.5px] font-medium text-text-muted uppercase tracking-wide">📅 Date of Joining</div>
                <div className="text-[13px] text-text mt-0.5">{fmtDate(row['Date Of Joining'] || row['Date_Of_Joining'])}</div>
              </div>
              <div className="rounded-lg border border-border bg-surface-2 px-3 py-2">
                <div className="text-[10.5px] font-medium text-text-muted uppercase tracking-wide">🎂 Date of Birth</div>
                <div className="text-[13px] text-text mt-0.5">{fmtDate(row['Date of Birth'] || row['Date_of_Birth'])}</div>
              </div>
            </div>
          )}

          {!loading && !row && errorMsg && (
            <div className="text-center py-4 text-danger text-[12.5px]">❌ {errorMsg}</div>
          )}
        </div>
      </div>
    </>
  )
}
