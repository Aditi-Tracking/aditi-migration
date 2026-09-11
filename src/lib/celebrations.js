import { SB_HDRS, SB_HDRS_MIN, SUPABASE_URL } from './supabaseClient'

// Ported from old-portal/js/celebrations.js — Phase 1 (detection layer +
// Home banner + single-target wish popup + "My Wishes" modal). The
// drawer's live wish chat (Phase 2) is a separate, deliberately unmerged
// system that only shares this table and a couple of these pure helpers.
//
// One consolidation made here per an explicit decision: old-portal keeps
// two independently-maintained DOB/DOJ column-name variant lists of
// different lengths (celebrations.js's is a strict superset of
// announcements.js's shorter copy) — this file uses the longer list
// everywhere, closing that divergence rather than replicating it.
const DOB_FIELDS = [
  'Date of Birth', 'Date_of_Birth', 'date_of_birth', 'DOB', 'dob',
  'DateOfBirth', 'date of birth', 'Date Of Birth', 'DATEOFBIRTH',
]
const DOJ_FIELDS = [
  'Date Of Joining', 'Date_Of_Joining', 'date_of_joining', 'DOJ', 'doj',
  'DateOfJoining', 'date of joining', 'Date of Joining', 'DATEOFJOING', 'Joining Date', 'joining_date',
]
const NAME_FIELDS = ['Employee_name', 'employee_name', 'Name', 'name', 'EMPLOYEE_NAME']
const EMAIL_FIELDS = ['Email_Id', 'email_id', 'Email', 'email', 'EMAIL_ID']
const DEPT_FIELDS = ['Employee_Dept', 'employee_dept', 'Emp_Dept', 'Department', 'dept']
const AVATAR_FIELDS = ['avatar_url', 'Avatar_url', 'Link', 'link', 'Photo', 'photo']

export function getField(row, keys) {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && row[k] !== '') return String(row[k]).trim()
  }
  return ''
}

export function parseCelebDate(str) {
  if (!str) return null
  try {
    const s = String(str).trim()
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
      const [d, m, y] = s.split('/')
      const dt = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10))
      return isNaN(dt.getTime()) ? null : dt
    }
    if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(s)) {
      const [d, m, y] = s.split('-')
      const dt = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10))
      return isNaN(dt.getTime()) ? null : dt
    }
    // ISO YYYY-MM-DD — local interpretation, deliberately avoids parsing the
    // raw string (which Date() would treat as UTC and can shift the day).
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      const parts = s.substring(0, 10).split('-')
      const dt = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10))
      return isNaN(dt.getTime()) ? null : dt
    }
    const dt = new Date(s)
    return isNaN(dt.getTime()) ? null : dt
  } catch {
    return null
  }
}

// Matches day+month only (ignores year) so birthdays/anniversaries recur
// every year. No Feb-29 fallback — matches production exactly (a
// deliberate, agreed non-fix: there's no unambiguous "correct" fallback).
export function isCelebToday(dateStr) {
  const d = parseCelebDate(dateStr)
  if (!d) return false
  const now = new Date()
  return d.getDate() === now.getDate() && d.getMonth() === now.getMonth()
}

export function yearsSince(dateStr) {
  const d = parseCelebDate(dateStr)
  if (!d) return 0
  const now = new Date()
  let years = now.getFullYear() - d.getFullYear()
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) {
    years--
  }
  return Math.max(0, years)
}

export function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

// Email or full-name match only — no first-name fallback (removed upstream
// after it showed one employee's celebration popup to a different
// employee sharing a first name).
export function isMe(person, currentUser) {
  if (!currentUser) return false
  const myEmail = (currentUser.email || '').toLowerCase().trim()
  const myName = (currentUser.name || '').toLowerCase().trim()
  if (myEmail && person.email && person.email.toLowerCase().trim() === myEmail) return true
  if (myName && person.name && person.name.toLowerCase().trim() === myName) return true
  return false
}

export function getEmpId(emailOrName, empList) {
  if (!empList || !empList.length) return null
  const key = (emailOrName || '').toLowerCase().trim()
  if (!key) return null
  let found = empList.find((e) => {
    const em = getField(e, EMAIL_FIELDS)
    return em && em.toLowerCase().trim() === key
  })
  if (!found) {
    found = empList.find((e) => {
      const nm = getField(e, NAME_FIELDS)
      return nm && nm.toLowerCase().trim() === key
    })
  }
  if (!found) return null
  return found.Emp_id || found.emp_id || found.EMP_ID || null
}

export async function fetchTodaysCelebrations() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/Employee_details?select=*&limit=500`, { headers: SB_HDRS() })
  if (!res.ok) return { birthdays: [], anniversaries: [], empList: [] }
  const employees = await res.json()
  if (!Array.isArray(employees) || !employees.length) return { birthdays: [], anniversaries: [], empList: [] }

  const birthdays = []
  const anniversaries = []

  employees.forEach((emp) => {
    const name = getField(emp, NAME_FIELDS)
    if (!name) return
    const email = getField(emp, EMAIL_FIELDS)
    const dept = getField(emp, DEPT_FIELDS)
    const avatar = getField(emp, AVATAR_FIELDS)
    const empId = emp.Emp_id || emp.emp_id || emp.EMP_ID || null

    const dob = getField(emp, DOB_FIELDS)
    const doj = getField(emp, DOJ_FIELDS)

    if (dob && isCelebToday(dob)) {
      birthdays.push({ name, email, dept, avatar, empId })
    }
    if (doj && isCelebToday(doj)) {
      const years = yearsSince(doj)
      if (years > 0) anniversaries.push({ name, email, dept, avatar, years, empId })
    }
  })

  return { birthdays, anniversaries, empList: employees }
}

// Same-session, in-memory only cache — mirrors _wishCheckCache.
const wishCheckCache = {}
function wishCheckKey(toPerson, type) {
  return type + '_' + (toPerson.empId || toPerson.email || toPerson.name)
}

// DB-authoritative — deliberately not localStorage-backed (would leak
// across different users sharing a browser/device).
export async function hasAlreadyWished(currentUser, toPerson, type, empList) {
  if (!currentUser) return false
  const cacheKey = wishCheckKey(toPerson, type)
  if (wishCheckCache[cacheKey] !== undefined) return wishCheckCache[cacheKey]

  const today = new Date().toISOString().split('T')[0]
  const hdrs = SB_HDRS()
  const fromEmpId = getEmpId(currentUser.email || currentUser.name, empList)
  const toEmpId = toPerson.empId || getEmpId(toPerson.email || toPerson.name, empList)
  let found = false

  try {
    if (fromEmpId && toEmpId) {
      const url = `${SUPABASE_URL}/rest/v1/birthday_wishes?select=id&from_emp_id=eq.${fromEmpId}&to_emp_id=eq.${toEmpId}&wish_date=eq.${today}&type=eq.${type}&limit=1`
      const res = await fetch(url, { headers: hdrs })
      if (res.ok) {
        const rows = await res.json()
        if (Array.isArray(rows) && rows.length) found = true
      }
    }
    if (!found) {
      const fromEmail = encodeURIComponent((currentUser.email || '').trim())
      const toEmail = encodeURIComponent((toPerson.email || '').trim())
      if (fromEmail && toEmail) {
        const url2 = `${SUPABASE_URL}/rest/v1/birthday_wishes?select=id&from_email=ilike.${fromEmail}&to_email=ilike.${toEmail}&wish_date=eq.${today}&type=eq.${type}&limit=1`
        const res2 = await fetch(url2, { headers: hdrs })
        if (res2.ok) {
          const rows2 = await res2.json()
          if (Array.isArray(rows2) && rows2.length) found = true
        }
      }
    }
  } catch {
    /* leave found=false — a transient error shouldn't block wishing */
  }

  wishCheckCache[cacheKey] = found
  return found
}

export function markWishedInCache(toPerson, type) {
  wishCheckCache[wishCheckKey(toPerson, type)] = true
}

// Resolves emp_id independently per call (not via any cross-module global)
// — this is what keeps Phase 2's drawer chat from needing the _qzEmpId
// coupling old-portal's chat has.
export async function sendWish(currentUser, toPerson, type, wishText, empList) {
  const today = new Date().toISOString().split('T')[0]
  const fromName = currentUser?.name || 'Colleague'
  const fromEmail = currentUser?.email || ''
  const toName = toPerson.name || ''
  const toEmail = toPerson.email || ''

  const fromEmpId = getEmpId(fromEmail || fromName, empList) || null
  const toEmpId = toPerson.empId || getEmpId(toEmail || toName, empList) || null

  const payload = {
    from_emp_id: fromEmpId,
    to_emp_id: toEmpId,
    from_name: fromName,
    from_email: fromEmail,
    to_name: toName,
    to_email: toEmail,
    wish_text: wishText,
    type,
    wish_date: today,
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/birthday_wishes`, {
    method: 'POST',
    headers: SB_HDRS_MIN(),
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(errText || 'Could not send wish')
  }
  markWishedInCache(toPerson, type)
}

export async function fetchWishesForSelf(toEmail, type, toEmpId) {
  const today = new Date().toISOString().split('T')[0]
  let url
  if (toEmpId) {
    url = `${SUPABASE_URL}/rest/v1/birthday_wishes?select=*,from_employee:Employee_details!birthday_wishes_from_emp_id_fkey(Employee_name,Employee_Dept,avatar_url,Link)&to_emp_id=eq.${toEmpId}&wish_date=eq.${today}&type=eq.${type}&order=created_at.asc`
  } else {
    url = `${SUPABASE_URL}/rest/v1/birthday_wishes?select=*&to_email=eq.${encodeURIComponent(toEmail)}&wish_date=eq.${today}&type=eq.${type}&order=created_at.asc`
  }
  const res = await fetch(url, { headers: SB_HDRS() })
  if (!res.ok) throw new Error('Could not load wishes')
  const data = await res.json()
  return Array.isArray(data) ? data : []
}

export async function fetchReplyForWish(currentUser, toPerson, type, empList) {
  const today = new Date().toISOString().split('T')[0]
  const hdrs = SB_HDRS()
  const fromEmpId = getEmpId(currentUser.email || currentUser.name, empList)
  const toEmpId = toPerson.empId || getEmpId(toPerson.email || toPerson.name, empList)
  let url
  if (fromEmpId && toEmpId) {
    url = `${SUPABASE_URL}/rest/v1/birthday_wishes?select=reply_text,wish_text&from_emp_id=eq.${fromEmpId}&to_emp_id=eq.${toEmpId}&wish_date=eq.${today}&type=eq.${type}&order=created_at.desc&limit=1`
  } else {
    const fe = encodeURIComponent((currentUser.email || '').trim())
    const te = encodeURIComponent((toPerson.email || '').trim())
    url = `${SUPABASE_URL}/rest/v1/birthday_wishes?select=reply_text,wish_text&from_email=ilike.${fe}&to_email=ilike.${te}&wish_date=eq.${today}&type=eq.${type}&order=created_at.desc&limit=1`
  }
  const res = await fetch(url, { headers: hdrs })
  if (!res.ok) return null
  const rows = await res.json()
  return Array.isArray(rows) && rows.length ? rows[0] : null
}

export async function saveReply(wishId, replyText) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/birthday_wishes?id=eq.${wishId}`, {
    method: 'PATCH',
    headers: SB_HDRS_MIN(),
    body: JSON.stringify({ reply_text: replyText }),
  })
  if (!res.ok && res.status !== 204) throw new Error('Could not save reply')
}

export async function saveReplyToAll(wishes, replyText) {
  let successCount = 0
  for (const w of wishes) {
    if (!w.id) continue
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/birthday_wishes?id=eq.${w.id}`, {
        method: 'PATCH',
        headers: SB_HDRS_MIN(),
        body: JSON.stringify({ reply_text: replyText }),
      })
      if (res.ok || res.status === 204) successCount++
    } catch {
      /* keep trying the rest */
    }
  }
  return successCount
}

export function fmtTime(isoStr) {
  try {
    return new Date(isoStr).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
  } catch {
    return ''
  }
}
