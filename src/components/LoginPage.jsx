import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

// Small inline icons, matching NavIcon.jsx's own convention (Feather-style stroke paths,
// viewBox 0 0 24 24, currentColor) rather than adding an icon library dependency for a
// handful of icons only used on this one page.
function IconBase({ children, className = 'w-4 h-4' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      {children}
    </svg>
  )
}
const MailIcon = (props) => (
  <IconBase {...props}>
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <polyline points="22 6 12 13 2 6" />
  </IconBase>
)
const LockIcon = (props) => (
  <IconBase {...props}>
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </IconBase>
)
const EyeIcon = (props) => (
  <IconBase {...props}>
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </IconBase>
)
const EyeOffIcon = (props) => (
  <IconBase {...props}>
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </IconBase>
)
const ArrowRightIcon = (props) => (
  <IconBase {...props}>
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </IconBase>
)

// Ported from old-portal/js/auth.js's doLogin() — same validation and error
// message mapping, restyled form only.
export default function LoginPage() {
  const { login, initializing } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    const trimmedEmail = email.trim().toLowerCase()
    const trimmedPass = password.trim()

    if (!trimmedEmail || !trimmedPass) {
      setError('Please enter both email and password!')
      return
    }

    setSubmitting(true)
    setError('')

    try {
      const { error: signInError } = await login(trimmedEmail, trimmedPass)
      if (signInError) {
        if (signInError.message.includes('Invalid login') || signInError.message.includes('invalid_grant')) {
          setError('Incorrect email or password. Please try again.')
        } else if (signInError.message.includes('Email not confirmed')) {
          setError('Please confirm your email address before logging in.')
        } else {
          setError('Login failed: ' + signInError.message)
        }
        setSubmitting(false)
      }
      // on success, AuthProvider flips currentUser and this component unmounts
    } catch {
      setError('Network error. Please check your internet connection and try again.')
      setSubmitting(false)
    }
  }

  const busy = submitting || initializing
  const buttonLabel = initializing ? 'Checking existing session…' : submitting ? 'Signing in…' : 'Sign In'

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-2 px-4">
      <div className="relative overflow-hidden w-full max-w-sm bg-surface border border-border rounded-2xl shadow-sm px-7 py-8">
        <div className="absolute top-0 inset-x-0 h-1 bg-primary" />

        <div className="flex justify-center mb-6">
          {/* The source PNG is a square 1080x1080 canvas with the actual icon+wordmark art
              sitting in a horizontal band with blank padding above/below it (confirmed by
              viewing the pixels, not just the file dimensions) — object-cover at the
              wordmark's own ~3:1 aspect ratio crops away only that blank padding, not any
              real content, so the logo renders large and legible instead of shrunk inside a
              mostly-empty square. */}
          <img
            src={`${import.meta.env.BASE_URL}aditi_tracking_logoo.png`}
            alt="Aditi Tracking"
            className="w-40 aspect-[3/1] object-cover block"
          />
        </div>

        <h1 className="font-serif font-bold text-[24px] text-text text-center">Welcome</h1>
        <p className="text-[12.5px] text-text-muted text-center mt-1 mb-6">Sign in to access your dashboard</p>

        {error && (
          <div className="mb-4 rounded-md border border-danger/25 bg-danger-tint px-3 py-2 text-[12.5px] text-danger">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[10.5px] font-semibold text-text-muted uppercase tracking-wide mb-1.5">Email Address</label>
            <div className="relative">
              <MailIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') document.getElementById('loginPassInput')?.focus()
                }}
                placeholder="your@email.com"
                className="w-full rounded-lg border border-border bg-surface pl-9 pr-3 py-2 text-[13px] text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10.5px] font-semibold text-text-muted uppercase tracking-wide mb-1.5">Password</label>
            <div className="relative">
              <LockIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                id="loginPassInput"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSubmit(e)
                }}
                placeholder="••••••••"
                className="w-full rounded-lg border border-border bg-surface pl-9 pr-10 py-2 text-[13px] text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted"
              >
                {showPassword ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-primary text-white text-[13.5px] font-medium py-2.5 mt-2 hover:bg-primary/90 disabled:opacity-70 transition-colors flex items-center justify-center gap-2"
          >
            {buttonLabel}
            {!busy && <ArrowRightIcon className="w-4 h-4" />}
          </button>
        </form>
      </div>
    </div>
  )
}
