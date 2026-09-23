// Field Service (submission-only form + listing/gallery). Ported from
// old-portal/js/fieldservice.js. Phase 1 of 2 — the Dashboard analytics tab
// (old-portal/js/fieldservice-dashboard.js) is its own lib/fieldServiceDashboard.js, built
// separately, matching production's own file split.
// Tables (Supabase): field_service_entries (id, engineer_id [a real Supabase Auth UID, NOT an
// Employee_details Emp_id/email], client_name, location, job_type, details [JSONB, shape varies
// per job type], created_at), field_service_photos (id, entry_id FK, field_label, storage_path,
// file_name). Storage bucket 'field-service-photos' is PUBLIC — plain <img src>, no blob-fetch/
// auth needed, unlike every private-bucket module elsewhere in this project.
// Access: field_service_create is no longer permission-gated anywhere (frontend or RLS) — every
// logged-in user can submit and see the Dashboard tab. field_service_view_all is the only
// permission that still does anything: "My Entries" vs "All Entries" wording/filters, and
// own-entry-only vs any-entry delete authority. No owner/MD/MIS role shortcut exists for
// view_all, unlike leadsPerm/fmsPerm elsewhere — even a super-admin needs it explicitly granted.
import { SUPABASE_URL, SB_HDRS, SB_HDRS_MIN, SB_HDRS_REPR, SUPABASE_ANON, getAuthToken, authClient } from './supabaseClient'
import { PAPI_URL } from './permissions'

export const FS_BUCKET = 'field-service-photos'

// Source of truth for the dynamic form — job type -> extra fields + photo label. Ported verbatim
// from JOB_TYPE_CONFIG.
export const JOB_TYPE_CONFIG = {
  new_installation: {
    label: 'New Installation',
    fields: [
      { key: 'vehicle_number', label: 'Vehicle Number', type: 'text' },
      { key: 'new_imei', label: 'New Device IMEI', type: 'text', numeric: true },
      { key: 'sim_number', label: 'SIM Number', type: 'text', numeric: true },
    ],
    photoLabel: 'Vehicle Number and Device IMEI Picture',
  },
  reinstallation: {
    label: 'Re-installation',
    fields: [
      { key: 'old_vehicle_number', label: 'Old Vehicle Number', type: 'text' },
      { key: 'new_vehicle_number', label: 'New Vehicle Number', type: 'text' },
    ],
    photoLabel: 'New Vehicle Picture and Device IMEI Picture',
  },
  device_replace: {
    label: 'Device Replace',
    fields: [
      { key: 'old_imei', label: 'Old Device IMEI', type: 'text', numeric: true },
      { key: 'new_imei', label: 'New Device IMEI', type: 'text', numeric: true },
    ],
    photoLabel: 'New Device Picture with IMEI',
  },
  sim_replace: {
    label: 'Sim Replace',
    fields: [
      { key: 'new_sim_number', label: 'New SIM Number', type: 'text', numeric: true },
      { key: 'old_sim_number', label: 'Old SIM Number', type: 'text', numeric: true },
    ],
    photoLabel: 'New Sim Picture',
  },
  sensor_replace: {
    label: 'Sensor Replace',
    fields: [
      { key: 'old_sensor', label: 'Old Sensor', type: 'text' },
      { key: 'new_sensor', label: 'New Sensor', type: 'text' },
    ],
    photoLabel: null,
  },
  device_sensor_remove: {
    label: 'Device or Sensor Remove',
    fields: [],
    photoLabel: 'Handover (Proof)',
  },
  device_sensor_collected: {
    label: 'Sensor or Device Collected',
    fields: [{ key: 'collection_proof', label: 'IMEI + note if any parts missing', type: 'textarea' }],
    photoLabel: 'Device Collected Pictures',
  },
  tampering: {
    label: 'Tampering',
    fields: [],
    photoLabel: 'Tampering Picture',
  },
  reactivation: {
    label: 'Reactivation',
    fields: [
      { key: 'new_sim_number', label: 'New SIM Number', type: 'text', numeric: true },
      { key: 'device_imei', label: 'Device IMEI', type: 'text', numeric: true },
      { key: 'new_vehicle_number', label: 'New Vehicle Number (optional)', type: 'text', required: false },
    ],
    photoLabel: 'New Sim + New Vehicle Picture Upload',
  },
  troubleshooting: {
    label: 'Troubleshooting',
    fields: [{ key: 'notes', label: 'Notes', type: 'textarea' }],
    photoLabel: 'Upload Photo',
  },
  officework: {
    label: 'Office Work',
    fields: [{ key: 'notes', label: 'Notes', type: 'textarea' }],
    photoLabel: 'Upload Photo',
  },
}

// ── Access control ───────────────────────────────────────────────────────────
export function canCreateFieldService(currentUser) {
  return !!currentUser // no longer permission-gated — every logged-in user can submit
}
export function canViewAllFieldService(currentUser, permissions) {
  return !!currentUser && (permissions?.field_service_view_all === 'true' || permissions?.field_service_has_branch_access === true)
}
export function hasFieldServiceAccess(currentUser, permissions) {
  return canCreateFieldService(currentUser) || canViewAllFieldService(currentUser, permissions)
}

export function publicPhotoUrl(storagePath) {
  return `${SUPABASE_URL}/storage/v1/object/public/${FS_BUCKET}/${storagePath.split('/').map(encodeURIComponent).join('/')}`
}

export async function getCurrentAuthUserId() {
  try {
    const { data } = await authClient.auth.getSession()
    return data?.session?.user?.id || null
  } catch {
    return null
  }
}

export function canDeleteEntry(entry, { viewAll, authUserId }) {
  return viewAll || (!!authUserId && entry.engineer_id === authUserId)
}

// ── Engineer/Client filter options — module-level cache, matching production's own
// "fetch once, cache for the session" globals (_fsEngineerOptions/_fsClientOptions), shared by
// both the List tab and the Dashboard tab (Phase 2) without either needing to know about the
// other's fetch. Never invalidated except by a fresh page load, exactly like production. ──
let _engineerOptions = null
let _clientOptions = null

// Only the service-role backend can resolve an auth uid to an email/name (see backend/api.py) —
// same PAPI_URL Flask backend already used by Access Control/Task Scheduler.
export async function fetchEngineerOptions(callerEmail) {
  if (_engineerOptions !== null) return _engineerOptions
  try {
    const res = await fetch(`${PAPI_URL}/api/field-service/engineer-names`, { headers: { 'X-User-Email': callerEmail } })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const data = await res.json()
    _engineerOptions = (data.engineers || []).slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  } catch {
    _engineerOptions = []
  }
  return _engineerOptions
}

export async function fetchClientOptions() {
  if (_clientOptions !== null) return _clientOptions
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/field_service_entries?select=client_name`, { headers: SB_HDRS() })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const rows = await res.json()
    _clientOptions = [...new Set(rows.map((r) => r.client_name).filter(Boolean))].sort((a, b) => a.localeCompare(b))
  } catch {
    _clientOptions = []
  }
  return _clientOptions
}

export function engineerName(engineerId) {
  const found = (_engineerOptions || []).find((en) => en.engineer_id === engineerId)
  return found ? found.name : engineerId
}

// ── Entries list ──────────────────────────────────────────────────────────────
// Filters (jobType/engineerId/clientName/from/to) only ever applied for a view_all viewer —
// matches production exactly: an own-scope viewer's list is never client-filtered, RLS alone
// already returns exactly their own rows.
export async function fetchEntries({ viewAll, jobType, engineerId, clientName, from, to } = {}) {
  let url = `${SUPABASE_URL}/rest/v1/field_service_entries?select=*,field_service_photos(*)&order=created_at.desc`
  if (viewAll) {
    if (jobType) url += `&job_type=eq.${encodeURIComponent(jobType)}`
    if (engineerId) url += `&engineer_id=eq.${encodeURIComponent(engineerId)}`
    if (clientName) url += `&client_name=eq.${encodeURIComponent(clientName)}`
    if (from) url += `&created_at=gte.${from}T00:00:00`
    if (to) url += `&created_at=lte.${to}T23:59:59`
  }
  const res = await fetch(url, { headers: SB_HDRS() })
  if (!res.ok) throw new Error('HTTP ' + res.status)
  return res.json()
}

export async function createEntry({ engineerId, clientName, location, jobType, details }) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/field_service_entries`, {
    method: 'POST',
    headers: SB_HDRS_REPR(),
    body: JSON.stringify({ engineer_id: engineerId, client_name: clientName, location, job_type: jobType, details }),
  })
  if (!res.ok) throw new Error((await res.text()) || 'HTTP ' + res.status)
  const [saved] = await res.json()
  return saved
}

// ── Photo upload — deliberately kept as XMLHttpRequest, not this project's usual fetch()
// substitution, because upload.onprogress drives a real, visible per-photo progress percentage;
// fetch() has no equivalent for a request body. Two-step, matching production exactly: the
// storage object POST needs progress (XHR), the photo-record insert doesn't (plain fetch). ──
export function uploadEntryPhoto(entryId, file, photoLabel, onProgress) {
  return new Promise((resolve, reject) => {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${entryId}/${Date.now()}_${safeName}`
    const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${FS_BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`
    const xhr = new XMLHttpRequest()
    xhr.open('POST', uploadUrl)
    xhr.setRequestHeader('apikey', SUPABASE_ANON)
    xhr.setRequestHeader('Authorization', `Bearer ${getAuthToken()}`)
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
    xhr.setRequestHeader('x-upsert', 'false')
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) onProgress(Math.round((ev.loaded / ev.total) * 100))
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(path)
      else reject(new Error('Upload failed (HTTP ' + xhr.status + ')'))
    }
    xhr.onerror = () => reject(new Error('Network error during upload'))
    xhr.send(file)
  }).then(async (path) => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/field_service_photos`, {
      method: 'POST',
      headers: SB_HDRS_MIN(),
      body: JSON.stringify({ entry_id: entryId, field_label: photoLabel, storage_path: path, file_name: file.name }),
    })
    if (!res.ok) throw new Error((await res.text()) || 'Could not save photo record (HTTP ' + res.status + ')')
  })
}

// ── Delete — storage files first (field_service_photos rows cascade-delete with the entry via
// FK, but the actual bucket objects do not) ──────────────────────────────────────────────────
async function fetchPhotoPaths(entryId) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/field_service_photos?entry_id=eq.${entryId}&select=storage_path`, { headers: SB_HDRS() })
  if (!res.ok) throw new Error('Could not read photo records (HTTP ' + res.status + ')')
  return res.json()
}

async function deleteStorageFiles(paths) {
  for (const path of paths) {
    if (!path) continue
    const url = `${SUPABASE_URL}/storage/v1/object/${FS_BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`
    const res = await fetch(url, { method: 'DELETE', headers: SB_HDRS() })
    if (!res.ok && res.status !== 404) {
      const body = await res.text().catch(() => '(could not read response body)')
      throw new Error(`Could not delete a photo file (HTTP ${res.status}): ${body || '(empty response body)'}`)
    }
  }
}

// Per-entry: fetch + delete its storage files, independently of the others, so one entry's
// failure doesn't block or hide the rest. Row deletion for every entry that made it past its own
// photo cleanup happens as one batched "in" filter call afterward.
export async function deleteEntries(ids) {
  const results = []
  for (const id of ids) {
    try {
      const photos = await fetchPhotoPaths(id)
      await deleteStorageFiles(photos.map((p) => p.storage_path))
      results.push({ id, ok: true })
    } catch (e) {
      results.push({ id, ok: false, error: e.message })
    }
  }
  const okIds = results.filter((r) => r.ok).map((r) => r.id)
  if (okIds.length) {
    const inList = okIds.map(encodeURIComponent).join(',')
    const res = await fetch(`${SUPABASE_URL}/rest/v1/field_service_entries?id=in.(${inList})`, { method: 'DELETE', headers: SB_HDRS() })
    if (!res.ok) {
      const t = await res.text()
      const msg = t || 'Could not delete entry (HTTP ' + res.status + ')'
      results.forEach((r) => {
        if (r.ok) {
          r.ok = false
          r.error = msg
        }
      })
    }
  }
  return results
}
