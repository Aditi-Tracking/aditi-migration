import { SB_HDRS, SB_HDRS_REPR, SUPABASE_URL } from './supabaseClient'
import { getEmpId } from './celebrations'

// Ported from old-portal/js/announcements.js's Celebrations-tab chat
// (Path B — a genuinely separate system from lib/celebrations.js's Path A,
// sharing only the birthday_wishes table and a couple of pure date
// helpers). See MIGRATION-NOTES.md for the two agreed deviations from a
// byte-for-byte port, both applied below.

export const EMOJI_LIST = [
  '🎉', '🎂', '🥳', '🎊', '🎁', '🌟', '✨', '💫', '🎈', '🥂',
  '❤️', '💛', '💙', '💜', '🤍', '🙌', '👏', '🤗', '😊', '😍',
  '🔥', '🚀', '💪', '👑', '🌺', '🌸', '🍰', '🎶', '⭐', '🌈',
]

const SELECT_FIELDS = 'id,wish_text,from_email,from_name,type,to_email,to_name,created_at'

export async function fetchTodaysWishes() {
  const today = new Date().toISOString().slice(0, 10)
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/birthday_wishes?select=${SELECT_FIELDS}&wish_date=eq.${today}&order=created_at.asc&limit=100`,
    { headers: SB_HDRS() }
  )
  if (!res.ok) return []
  const data = await res.json()
  return Array.isArray(data) ? data : []
}

// Incremental poll query — only messages newer than the last known id.
export async function fetchNewWishesSince(lastId) {
  const today = new Date().toISOString().slice(0, 10)
  const idFilter = lastId > 0 ? `&id=gt.${lastId}` : ''
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/birthday_wishes?select=${SELECT_FIELDS}&wish_date=eq.${today}${idFilter}&order=created_at.asc&limit=50`,
    { headers: SB_HDRS() }
  )
  if (!res.ok) return []
  const data = await res.json()
  return Array.isArray(data) ? data : []
}

export async function fetchAvatarsForEmails(emails) {
  const uncached = [...new Set(emails.filter(Boolean))].slice(0, 20)
  if (!uncached.length) return {}
  const emailList = uncached.map((e) => `"${e}"`).join(',')
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/Employee_details?select=Email_Id,avatar_url,Link&Email_Id=in.(${emailList})`,
    { headers: SB_HDRS() }
  )
  if (!res.ok) return {}
  const rows = await res.json()
  const map = {}
  rows.forEach((r) => {
    const url = r.avatar_url || r.Link || null
    const email = (r.Email_Id || '').toLowerCase()
    if (email && url) map[email] = url
  })
  return map
}

// Ported from annSendChatWish. Always targets the first celebrant only —
// no target picker (the one modal with one, openAnnWishModal, is dead in
// production and deliberately not ported). Falls back to a placeholder
// team target + 'general' type when nobody's celebrating today —
// production's intentional graceful degradation to a general team message
// board, not a bug, so replicated exactly.
//
// One deliberate fix vs. a byte-for-byte port: POSTs with
// return=representation and returns the real inserted row's id, instead
// of production's fabricated Date.now() id — that fake id never matches
// the real row once the 5s poll fetches it, producing a visible duplicate
// bubble on the sender's own screen. No feature relies on that duplicate.
export async function sendChatWish({ currentUser, target, message, empList }) {
  const toEmail = target?.email || 'team@celebrations'
  const toName = target?.name || 'Team'
  const celebType = target?.celebType || 'general'
  const today = new Date().toISOString().slice(0, 10)
  const senderName = currentUser?.name || currentUser?.email?.split('@')[0] || 'Someone'
  const fromEmpId = getEmpId(currentUser?.email || currentUser?.name, empList) || null

  const body = {
    wish_text: message,
    type: celebType,
    wish_date: today,
    from_email: currentUser?.email || null,
    from_name: senderName,
    to_name: toName,
    to_email: toEmail,
  }
  if (fromEmpId) body.from_emp_id = fromEmpId

  const res = await fetch(`${SUPABASE_URL}/rest/v1/birthday_wishes`, {
    method: 'POST',
    headers: SB_HDRS_REPR(),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => String(res.status))
    throw new Error(errText.substring(0, 120))
  }
  const rows = await res.json()
  const row = Array.isArray(rows) ? rows[0] : rows

  return {
    id: row.id,
    wish_text: message,
    from_email: currentUser?.email || null,
    from_name: senderName,
    type: celebType,
    to_email: toEmail,
    to_name: toName,
    created_at: row.created_at || new Date().toISOString(),
  }
}
