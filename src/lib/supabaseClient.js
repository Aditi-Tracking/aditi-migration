import { createClient } from '@supabase/supabase-js'

// Same project + anon key as old-portal/js/app.js and old-portal/js/auth.js — never change
// one without the other. Read from env (see .env.example) rather than hardcoded, so
// dev/staging/prod can point at different projects without a code change.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
export const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY

// Used only for Supabase Auth (sign in/out, session). All data access goes through
// raw REST fetch() calls with SB_HDRS(), matching old-portal's pattern exactly —
// see old-portal/js/app.js's SB_HDRS/SB_HDRS_JSON/SB_HDRS_REPR/SB_HDRS_MIN.
export const authClient = createClient(SUPABASE_URL, SUPABASE_ANON)

// Mirrors old-portal's global `_currentToken`: anon key before login, the user's
// JWT after login (set from the Supabase session), reset to anon on logout.
let _currentToken = SUPABASE_ANON

export function setAuthToken(token) {
  _currentToken = token || SUPABASE_ANON
}

export function getAuthToken() {
  return _currentToken
}

export const SB_HDRS = () => ({
  apikey: SUPABASE_ANON,
  Authorization: `Bearer ${_currentToken}`,
  Accept: 'application/json',
})

export const SB_HDRS_JSON = () => ({ ...SB_HDRS(), 'Content-Type': 'application/json' })
export const SB_HDRS_REPR = () => ({ ...SB_HDRS_JSON(), Prefer: 'return=representation' })
export const SB_HDRS_MIN = () => ({ ...SB_HDRS_JSON(), Prefer: 'return=minimal' })
