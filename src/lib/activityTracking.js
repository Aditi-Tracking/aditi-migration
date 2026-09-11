import { SUPABASE_ANON, SUPABASE_URL, getAuthToken } from './supabaseClient'

// Ported from old-portal/js/activitylog.js — the WRITE side (Part B).
// Old-portal keeps this as bare module-level `let`s (_actPageName,
// _actPageStart, _actCardName, _ACT_SESSION_ID) so every tracking call
// site can be a one-line addition at an existing action point rather than
// threading state through props/context. This file mirrors that shape on
// purpose — same call-site ergonomics, same resulting activity_logs rows.
//
// One deliberate deviation from production: the beforeunload/page_unload
// write used to store a STRING (email) in the numeric emp_id FK column,
// corrupting that row's employee lookup. Fixed here to write numeric
// emp_id + employee_email like every other event type — see
// MIGRATION-NOTES.md's "Bug fixes made" section.

const SESSION_ID = 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)

let pageName = 'home'
let pageStart = Date.now()
let loginTime = Date.now()
let cardName = null

function detectDevice() {
  const ua = navigator.userAgent
  const isTablet = /iPad/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const isMobile = /Android|iPhone|iPod|Mobile/i.test(ua) && !isTablet
  return isMobile || isTablet ? 'mobile' : 'desktop'
}

// Core logger — fire-and-forget, never throws into the caller. `user` is
// { email, empId, name, role, location } — the equivalent of old-portal's
// global CURRENT_USER, passed explicitly since this module has no React
// context of its own.
export async function logActivity(user, data) {
  try {
    if (!user?.email) return
    const fullPayload = {
      emp_id: user.empId || undefined,
      employee_email: user.email || null,
      event_type: data.event_type || 'unknown',
      event_detail: data.event_detail || '',
      session_id: SESSION_ID,
      device: detectDevice(),
      page_name: data.page_name || pageName || '',
      card_name: data.card_name || null,
      duration_seconds: data.duration_seconds ?? null,
      video_title: data.video_title || null,
      video_watch_seconds: data.video_watch_seconds ?? null,
      video_watch_percent: data.video_watch_percent ?? null,
      file_name: data.file_name || null,
      logout_at: data.logout_at || null,
      session_duration_seconds: data.session_duration_seconds ?? null,
      metadata: data.metadata || null,
    }
    Object.keys(fullPayload).forEach((k) => {
      if (fullPayload[k] === null || fullPayload[k] === undefined) delete fullPayload[k]
    })

    const hdrs = {
      apikey: SUPABASE_ANON,
      Authorization: `Bearer ${getAuthToken()}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    }

    const res = await fetch(`${SUPABASE_URL}/rest/v1/activity_logs`, {
      method: 'POST',
      headers: hdrs,
      body: JSON.stringify(fullPayload),
    })

    // Fallback to basic columns if the newer columns don't exist yet.
    if (!res.ok) {
      const basicPayload = {
        emp_id: fullPayload.emp_id || undefined,
        employee_email: fullPayload.employee_email || undefined,
        event_type: fullPayload.event_type,
        event_detail: [
          fullPayload.event_detail,
          fullPayload.page_name ? 'page:' + fullPayload.page_name : '',
          fullPayload.card_name ? 'card:' + fullPayload.card_name : '',
          fullPayload.video_title ? 'video:' + fullPayload.video_title : '',
          fullPayload.duration_seconds != null ? 'dur:' + fullPayload.duration_seconds + 's' : '',
        ]
          .filter(Boolean)
          .join(' | '),
        session_id: fullPayload.session_id,
        device: fullPayload.device,
      }
      fetch(`${SUPABASE_URL}/rest/v1/activity_logs`, { method: 'POST', headers: hdrs, body: JSON.stringify(basicPayload) }).catch(
        () => {}
      )
    }
  } catch {
    /* silent fail — never break UI */
  }
}

// Called on every panel switch — logs the page being LEFT (if dwell was
// over 30s, to cut noise), then starts the new page's timer. Mirrors
// _actOnPageSwitch exactly, including that card_name is deliberately NOT
// reset here (a page switch alone doesn't close whatever card was open).
export function trackPageSwitch(user, newPage) {
  const secs = Math.round((Date.now() - pageStart) / 1000)
  if (pageName && secs > 30) {
    logActivity(user, { event_type: 'page_view', event_detail: `Visited: ${pageName}`, page_name: pageName, duration_seconds: secs })
  }
  pageName = newPage
  pageStart = Date.now()
}

export function trackLogin(user) {
  loginTime = Date.now()
  logActivity(user, {
    event_type: 'login',
    event_detail: `User logged in: ${user.name || user.email}`,
    page_name: 'home',
    metadata: { role: user.role, location: user.location },
  })
}

// Mirrors doLogout(): a page_view for the current page (if dwell > 30s),
// then an unconditional logout event with total session duration.
export function trackLogout(user) {
  const secs = Math.round((Date.now() - pageStart) / 1000)
  if (pageName && secs > 30) {
    logActivity(user, { event_type: 'page_view', event_detail: `Last page: ${pageName}`, page_name: pageName, duration_seconds: secs })
  }
  logActivity(user, {
    event_type: 'logout',
    event_detail: `User logged out: ${user.name || user.email}`,
    session_duration_seconds: Math.round((Date.now() - loginTime) / 1000),
    logout_at: new Date().toISOString(),
  })
}

// Fires on tab close/navigate-away — best effort via fetch+keepalive
// (sendBeacon can't carry auth headers). Unlike production, emp_id/
// employee_email are written the same way as every other event type here
// (see file-header note) — this is the one deliberate fix, not a port.
export function trackPageUnload(user) {
  if (!user?.email) return
  const totalSecs = Math.round((Date.now() - loginTime) / 1000)
  const payload = {
    emp_id: user.empId || undefined,
    employee_email: user.email,
    event_type: 'page_unload',
    event_detail: 'Browser tab closed / navigated away',
    session_id: SESSION_ID,
    device: detectDevice(),
    page_name: pageName,
    session_duration_seconds: totalSecs,
    logout_at: new Date().toISOString(),
    metadata: { unload: true },
  }
  Object.keys(payload).forEach((k) => {
    if (payload[k] === null || payload[k] === undefined) delete payload[k]
  })
  fetch(`${SUPABASE_URL}/rest/v1/activity_logs`, {
    method: 'POST',
    keepalive: true,
    headers: {
      apikey: SUPABASE_ANON,
      Authorization: `Bearer ${getAuthToken()}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(payload),
  }).catch(() => {})
}

// card_open/card_close never write a row themselves in production (too
// noisy — see _actOnCardOpen's own comment) — they only seed this ambient
// "current card name" for a later file/video-open event to read. Kept as
// ambient module state (not React state) to match production's own
// leaky-across-navigation behavior exactly, including that it's opt-in
// per module (see CNSectionPanel's trackCardOpen/trackCardClose props).
export function setCardName(name) {
  cardName = name
}
export function clearCardName() {
  cardName = null
}
export function getCardName() {
  return cardName
}
