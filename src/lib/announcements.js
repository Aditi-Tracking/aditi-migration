import { SB_HDRS, SUPABASE_URL } from './supabaseClient'

// Ported from old-portal/js/announcements.js. The "Updates" half of the
// drawer (portal_update_text) lives here; the "Celebrations" tab's chat is
// in lib/announcementsCelebChat.js. Seen-tracking keys are namespaced
// (u_<id> / c_<key>) so both tabs share one combined unread count, matching
// production's _annUpdateBadge.

export async function fetchPortalUpdates() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/portal_update_text?select=id,title,body,posted_by,created_at&order=created_at.desc&limit=50`,
    { headers: SB_HDRS() }
  )
  if (!res.ok) return []
  const data = await res.json()
  return (Array.isArray(data) ? data : [])
    .filter((r) => r.title && r.title.trim())
    .map((r) => ({
      id: r.id,
      title: r.title || 'Portal Update',
      body: r.body || '',
      posted_by: r.posted_by || 'MIS Team',
      created_at: r.created_at,
    }))
}

export async function postPortalUpdate({ title, body, postedBy }) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/portal_update_text`, {
    method: 'POST',
    headers: { ...SB_HDRS(), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ title, body, posted_by: postedBy || 'MIS Team' }),
  })
  if (!res.ok) throw new Error((await res.text()) || res.statusText)
}

export async function updatePortalUpdate(id, { title, body }) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/portal_update_text?id=eq.${id}`, {
    method: 'PATCH',
    headers: { ...SB_HDRS(), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ title, body }),
  })
  if (!res.ok) throw new Error((await res.text()) || res.statusText)
}

export async function deletePortalUpdate(id) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/portal_update_text?id=eq.${id}`, {
    method: 'DELETE',
    headers: { ...SB_HDRS(), 'Content-Type': 'application/json' },
  })
  if (!res.ok) throw new Error((await res.text()) || res.statusText)
}

// Ported from old-portal/js/announcements.js's _annTimeLabel — IST-aware
// "Today"/"Yesterday"/"X days ago" label.
export function formatTimeLabel(dateStr) {
  if (!dateStr) return ''
  const toIST = (dt) => {
    const utc = dt.getTime() + dt.getTimezoneOffset() * 60000
    return new Date(utc + 5.5 * 3600000)
  }
  const dIST = toIST(new Date(dateStr))
  const nowIST = toIST(new Date())
  const dDate = dIST.toISOString().slice(0, 10)
  const nowDate = nowIST.toISOString().slice(0, 10)
  if (dDate === nowDate) return '🔴 Today'
  const diffMs = new Date(nowDate) - new Date(dDate)
  const diffDays = Math.round(diffMs / 86400000)
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return diffDays + ' days ago'
  if (diffDays < 30) return Math.floor(diffDays / 7) + ' weeks ago'
  if (diffDays < 365) return Math.floor(diffDays / 30) + ' months ago'
  return Math.floor(diffDays / 365) + ' years ago'
}

// Ported from old-portal/js/announcements.js's _safeBody — escape HTML
// first (XSS-safe), then linkify URLs. Rendered via dangerouslySetInnerHTML
// by the consumer, safe because escaping always happens first.
export function safeBody(text) {
  if (!text) return ''
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
  const withBreaks = escaped.replace(/\n/g, '<br>')
  return withBreaks.replace(
    /(https?:\/\/[^\s<>"'\]]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer" style="color:var(--color-primary);text-decoration:underline;word-break:break-all;">$1</a>'
  )
}

function todayKey() {
  const d = new Date()
  return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate()
}

// Stable key for a celebrant (no row id on an Employee_details record) —
// port of _annCelebKey.
export function celebKey(c) {
  return 'c_' + (c.name || '').replace(/\s+/g, '_') + '_' + (c.celebType || 'bday')
}

export function getSeenIds() {
  try {
    return JSON.parse(localStorage.getItem('annSeenIds') || '[]')
  } catch {
    return []
  }
}

export function markAllSeen(updates, celebs = []) {
  try {
    const ids = [...updates.map((a) => 'u_' + a.id), ...celebs.map(celebKey)]
    localStorage.setItem('annSeenIds', JSON.stringify(ids))
    localStorage.setItem('annSeen_' + todayKey(), '1')
  } catch {
    /* localStorage may be unavailable — ignore */
  }
}

export function isSeenToday() {
  try {
    return localStorage.getItem('annSeen_' + todayKey()) === '1'
  } catch {
    return false
  }
}

export function computeUnreadCount(updates, celebs = []) {
  if (isSeenToday()) return 0
  const seenIds = getSeenIds()
  const unseenUpdates = updates.filter((a) => !seenIds.includes('u_' + a.id))
  const unseenCelebs = celebs.filter((c) => !seenIds.includes(celebKey(c)))
  return unseenUpdates.length + unseenCelebs.length
}
