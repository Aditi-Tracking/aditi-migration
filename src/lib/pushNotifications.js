import { SUPABASE_URL } from './supabaseClient'

// Ported from old-portal/index.html's inline OneSignal Web Push script (the "bell icon" feature).
// OS_APP_ID is OneSignal's public App ID — safe to expose client-side. The actual secret (the
// OneSignal REST API key needed to send a push) never appears here: it lives server-side in the
// already-deployed `send-push` Supabase Edge Function, the same pattern lib/taskDelegation.js's
// sendAssignmentEmail already established for send-delegation-task-email — no new backend
// component of our own, just calling an endpoint that already exists and already works.
const OS_APP_ID = '5b1d05e6-49bb-4b53-b3de-c57e83b4e229'
const PUSH_URL = `${SUPABASE_URL}/functions/v1/send-push`

let _ready = false
let _readyCallbacks = []

function _notifyReady() {
  _ready = true
  const callbacks = _readyCallbacks
  _readyCallbacks = []
  callbacks.forEach((cb) => cb())
}

// Registers a callback for when OneSignal.init() has resolved — fires immediately if already ready.
export function onOneSignalReady(cb) {
  if (_ready) cb()
  else _readyCallbacks.push(cb)
}

// Call once at app startup (main.jsx) — matches production's inline <head> script initializing
// unconditionally before the app itself, independent of login state.
export function initOneSignal() {
  if (typeof window === 'undefined') return
  window.OneSignalDeferred = window.OneSignalDeferred || []
  window.OneSignalDeferred.push(async (OneSignal) => {
    try {
      await OneSignal.init({
        appId: OS_APP_ID,
        notifyButton: { enable: false },
        welcomeNotification: { disable: true },
        serviceWorkerPath: 'OneSignalSDKWorker.js',
      })
      _notifyReady()
    } catch (e) {
      console.warn('OneSignal init:', e)
    }
  })
}

export function isPushSubscribed() {
  try {
    return _ready && !!window.OneSignal?.User?.PushSubscription?.optedIn
  } catch {
    return false
  }
}

// Ported from osToggle. Returns the new subscribed state, or null if OneSignal isn't ready yet
// (caller shows a "please wait" toast, matching production's own guard).
export async function togglePushSubscription() {
  if (!_ready) return null
  if (isPushSubscribed()) {
    await window.OneSignal.User.PushSubscription.optOut()
    return false
  }
  await window.OneSignal.User.PushSubscription.optIn()
  return true
}

// Ported from osSendPush — fire-and-forget via the already-deployed send-push Edge Function,
// same non-blocking convention as taskDelegation.js's sendAssignmentEmail (a failed/slow send
// never blocks the caller).
export function sendPush(title, message) {
  fetch(PUSH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, message }),
  }).catch((e) => console.warn('sendPush error:', e))
}
