import { SB_HDRS, SUPABASE_ANON, SUPABASE_URL, getAuthToken } from './supabaseClient'

// Same query as old-portal/js/auth.js's _loadUserProfile — used to derive
// role/rawRole/name/location right after login.
export async function fetchLoginEmployeeInfo(email) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/Employee_details?select=Employee_name,Employee_Dept,Location,Email_Id&Email_Id=ilike.${encodeURIComponent(email)}&limit=1`,
      { headers: SB_HDRS() }
    )
    const rows = await res.json()
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null
  } catch {
    return null
  }
}

// Same query as old-portal/js/activitylog.js's _fetchAndCacheEmpId — needed
// to populate CURRENT_USER.empId (a prerequisite for Referral submission's
// referrer_emp_id, and per that function's own comment, a future
// _canUploadQuiz check too).
export async function fetchEmployeeId(email) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/Employee_details?select=Emp_id&Email_Id=ilike.${encodeURIComponent(email)}&limit=1`,
      { headers: SB_HDRS() }
    )
    if (!res.ok) return null
    const rows = await res.json()
    return Array.isArray(rows) && rows.length > 0 ? rows[0].Emp_id : null
  } catch {
    return null
  }
}

// Same 3-step fallback as old-portal/js/app.js's showProfileDetails:
// email match -> exact Employee_name match -> first-name-only match.
export async function fetchFullEmployeeProfile(name, email) {
  const tryEmailLookup = email
    ? fetch(
        `${SUPABASE_URL}/rest/v1/Employee_details?select=*&Email_Id=ilike.${encodeURIComponent(email)}&limit=1`,
        { headers: SB_HDRS() }
      ).then((r) => r.json())
    : Promise.resolve([])

  const emailRows = await tryEmailLookup
  if (emailRows && emailRows.length > 0) return emailRows[0]

  const encodedName = encodeURIComponent(name.trim())
  const nameRows = await fetch(
    `${SUPABASE_URL}/rest/v1/Employee_details?select=*&Employee_name=ilike.${encodedName}&limit=1`,
    { headers: SB_HDRS() }
  ).then((r) => r.json())
  if (nameRows && nameRows.length > 0) return nameRows[0]

  const firstName = name.trim().split(/\s+/)[0]
  if (firstName && firstName.toLowerCase() !== name.toLowerCase()) {
    const firstNameRows = await fetch(
      `${SUPABASE_URL}/rest/v1/Employee_details?select=*&Employee_name=ilike.${encodeURIComponent(firstName)}&limit=1`,
      { headers: SB_HDRS() }
    ).then((r) => r.json())
    if (firstNameRows && firstNameRows.length > 0) return firstNameRows[0]
  }

  return null
}

// Same upload flow as old-portal/js/app.js's uploadProfilePhoto: Storage POST
// to Employee_Photos/avatars/{email}.{ext}, then PATCH Employee_details.avatar_url.
export async function uploadProfilePhoto(email, file) {
  const token = getAuthToken()
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
  const filePath = `avatars/${email}.${ext}`
  const bucket = 'Employee_Photos'

  const uploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${filePath}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON,
      Authorization: `Bearer ${token}`,
      'Content-Type': file.type,
      'Cache-Control': '3600',
      'x-upsert': 'true', // agar file already hai toh overwrite karo
    },
    body: file,
  })
  if (!uploadRes.ok) {
    const errTxt = await uploadRes.text()
    throw new Error('Upload failed: ' + errTxt)
  }

  const ts = Date.now()
  const avatarUrl = `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${filePath}?t=${ts}`

  const patchRes = await fetch(
    `${SUPABASE_URL}/rest/v1/Employee_details?Email_Id=ilike.${encodeURIComponent(email)}`,
    {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_ANON,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ avatar_url: avatarUrl }),
    }
  )
  if (!patchRes.ok) {
    const errTxt2 = await patchRes.text()
    throw new Error('DB update failed: ' + errTxt2)
  }

  return avatarUrl
}
