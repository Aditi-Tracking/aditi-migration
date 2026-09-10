import { createClient } from '@supabase/supabase-js'

// Same project + anon key as old-portal/js/app.js and old-portal/js/auth.js — never change
// one without the other.
export const SUPABASE_URL = 'https://rramdtpabwjsndgkohbi.supabase.co'
export const SUPABASE_ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJyYW1kdHBhYndqc25kZ2tvaGJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5MDQ4ODUsImV4cCI6MjA5MTQ4MDg4NX0.hpdTOkhRrbqmbPM6VJWEtz2oEjkeXAjYJQS9rgzheec'

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
