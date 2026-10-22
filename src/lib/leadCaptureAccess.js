// Lead Capture access — ONE tier per person (None / Field Sales / Sales Person / Admin), kept in its own table (lead_capture_roles), NOT in the portal's
// role_defaults / user_permissions and independent of the person's portal role. The database is the only place the tiers are defined (sql/step20, lc_caps):
// this module just asks it who the caller is and what that tier holds — the screen carries no copy of the mapping.
//   lc_my_access()                         → { tier, permissions }   permissions: { key: 'true', … } in the SAME key names the *Permissions.js libraries read
//   lead_capture_roles_list()              → everyone in the employee directory with their tier           (MIS only)
//   set_lead_capture_role(email, tier)     → assign / change / remove (null = remove)                     (MIS only)
//   lead_capture_roles_history(email?, n)  → who changed whose tier, newest first                         (MIS only)
import { SUPABASE_URL, SB_HDRS_JSON } from './supabaseClient'

const SB = SUPABASE_URL + '/rest/v1'

// The tier VALUES are prefixed lc_ on purpose: they must never be confused with the portal's own roles (owner / mis / admin / employee …).
export const LC_TIERS = [
  { value: 'lc_field_sales', label: 'Field Sales', hint: 'Field Sales Form (submit, own entries) · own Sales FMS and MeCa, view only' },
  { value: 'lc_sales_person', label: 'Sales Person', hint: 'Enquiry Capture Sheet, view only (own entered / assigned leads) · own Sales FMS and MeCa, view only' },
  { value: 'lc_admin', label: 'Admin', hint: 'All five tabs, every write' },
]
export const tierLabel = (tier) => LC_TIERS.find((t) => t.value === tier)?.label || 'None'

async function rpc(fn, body, fallback) {
  const res = await fetch(`${SB}/rpc/${fn}`, { method: 'POST', headers: SB_HDRS_JSON(), body: JSON.stringify(body) })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    let msg = text
    let code = ''
    try {
      const j = JSON.parse(text)
      msg = j.message || j.hint || text
      code = j.code || ''
    } catch {
      /* not JSON — use the raw text */
    }
    const err = new Error(code === '42501' || res.status === 401 || res.status === 403 ? msg || "You don't have permission to do that." : msg || fallback || 'HTTP ' + res.status)
    err.code = code === '42501' ? 'denied' : code === '22023' ? 'invalid' : 'error'
    throw err
  }
  return res.json()
}

// → { tier: 'lc_admin' | 'lc_sales_person' | 'lc_field_sales' | null, permissions: { enquiry_view: 'true', … } }
export const fetchLeadCaptureAccess = () => rpc('lc_my_access', {}, 'Could not load your Lead Capture access.')

// → [{ email, name, dept, tier, assigned_by, assigned_at, linked_sales_person }]
export const fetchLeadCaptureRoles = () => rpc('lead_capture_roles_list', {}, 'Could not load the Lead Capture access list.')
// tier: one of LC_TIERS' values, or null to remove the person's access. → { email, old, new, changed }
export const setLeadCaptureRole = (email, tier) => rpc('set_lead_capture_role', { p_email: email, p_role: tier || null }, 'Could not save the Lead Capture access.')
// → [{ email, old, new, by, at }]
export const fetchLeadCaptureHistory = (email = null, limit = 20) => rpc('lead_capture_roles_history', { p_email: email, p_limit: limit }, 'Could not load the history.')
