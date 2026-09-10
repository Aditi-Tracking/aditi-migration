import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

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

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-2 px-4">
      <div className="w-full max-w-sm bg-surface border border-border rounded-2xl shadow-sm px-7 py-8">
        <div className="flex justify-center mb-5">
          <div className="w-14 h-14 rounded-xl border border-border overflow-hidden flex items-center justify-center bg-surface-2">
            <img src="/aditi_tracking_logoo.png" alt="Aditi Tracking" className="w-full h-full object-contain" />
          </div>
        </div>

        <h1 className="text-[19px] font-semibold text-text text-center">Welcome</h1>
        <p className="text-[12.5px] text-text-muted text-center mt-1 mb-6">Sign in to access your dashboard</p>

        {error && (
          <div className="mb-4 rounded-md border border-danger/25 bg-danger-tint px-3 py-2 text-[12.5px] text-danger">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[12px] font-medium text-text mb-1.5">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') document.getElementById('loginPassInput')?.focus()
              }}
              placeholder="your@email.com"
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-[12px] font-medium text-text mb-1.5">Password</label>
            <div className="relative">
              <input
                id="loginPassInput"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSubmit(e)
                }}
                placeholder="••••••••"
                className="w-full rounded-md border border-border bg-surface px-3 py-2 pr-10 text-[13px] text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted text-[13px]"
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-primary text-white text-[13.5px] font-medium py-2.5 mt-2 hover:bg-primary/90 disabled:opacity-70 transition-colors flex items-center justify-center gap-2"
          >
            {initializing ? 'Checking existing session…' : submitting ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <div className="flex items-center justify-center gap-1.5 mt-6 text-[11px] text-text-muted">
          <span className="w-1.5 h-1.5 rounded-full bg-primary" />
          Secured with Supabase Authentication
        </div>
      </div>
    </div>
  )
}
