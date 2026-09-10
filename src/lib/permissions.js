// Ported byte-for-byte from old-portal/js/auth.js (role defaults, permissions
// cache, retry fetch). Do not change table/endpoint names or role keys here
// without also verifying old-portal/js/auth.js still matches.

export const PAPI_URL = 'https://knowlege-based-portal-production.up.railway.app'

// Fallback — builds PERMISSIONS from rawRole if the Python backend is
// unreachable. Mirrors role_defaults (checked live against Supabase on
// 2026-08-03) per role — only keys a role is actually granted need listing;
// anything absent reads as undefined everywhere it's checked (`PERMISSIONS.x
// === 'true'`), which is equivalent to 'false'.
export const ROLE_DEFAULT_PERMISSIONS = {
  owner: {
    can_download_video: 'true', can_edit_mapping: 'true', can_post_referral_role: 'true',
    can_view_activitylog: 'true', can_view_announcements: 'true', can_view_crm: 'true',
    can_view_crm_changes: 'true', can_view_enterprise: 'true', can_view_fms: 'true',
    can_view_ims: 'true', can_view_leads: 'true', can_view_mapping: 'true',
    can_view_my_referrals: 'true', can_view_open_roles: 'true', can_view_referral_pipeline: 'true',
    checklist_scope: 'all', hr_employee_edit: 'true', hr_employee_view: 'true',
    mapping_region_headoffice: 'true', mapping_region_goa: 'true', mapping_region_bangalore: 'true',
    mapping_region_gujarat: 'true', vendor_view_all: 'true',
  },
  mis: {
    can_delete_tasks: 'true', can_download_video: 'true', can_edit_mapping: 'true',
    can_post_announcements: 'true', can_post_referral_role: 'true', can_upload_files: 'true',
    can_upload_quiz: 'true', can_view_activitylog: 'true', can_view_announcements: 'true',
    can_view_crm: 'true', can_view_crm_changes: 'true', can_view_enterprise: 'true',
    can_view_entsol: 'true', can_view_fms: 'true', can_view_ims: 'true', can_view_leads: 'true',
    can_view_mapping: 'true', can_view_my_referrals: 'true', can_view_open_roles: 'true',
    can_view_referral_pipeline: 'true', checklist_scope: 'all',
    crm_server_bangalore: 'true', crm_server_goa: 'true', crm_server_gujarat: 'true',
    crm_server_premium: 'true', crm_server_pro: 'true', hr_employee_edit: 'true', hr_employee_view: 'true',
    mapping_region_headoffice: 'true', mapping_region_goa: 'true', mapping_region_bangalore: 'true',
    mapping_region_gujarat: 'true', vendor_view_all: 'true',
  },
  pc: {
    can_view_announcements: 'true', can_view_fms: 'true', can_view_ims: 'true',
    can_view_leads: 'true', can_view_my_referrals: 'true', can_view_open_roles: 'true',
    checklist_scope: 'all',
  },
  'executive assistant': {
    can_view_announcements: 'true', can_view_enterprise: 'true', can_view_fms: 'true',
    can_view_ims: 'true', can_view_leads: 'true', can_view_my_referrals: 'true',
    can_view_open_roles: 'true', checklist_scope: 'all', vendor_view_all: 'true',
  },
  admin: {
    can_download_video: 'true', can_post_referral_role: 'true', can_view_activitylog: 'true',
    can_view_announcements: 'true', can_view_crm: 'true', can_view_entsol: 'true',
    can_view_fms: 'true', can_view_ims: 'true', can_view_leads: 'true',
    can_view_my_referrals: 'true', can_view_open_roles: 'true', can_view_referral_pipeline: 'true',
    checklist_scope: 'all',
  },
  employee: {
    can_view_announcements: 'true', can_view_my_referrals: 'true', can_view_open_roles: 'true',
    checklist_scope: 'own',
  },
  hr: {
    can_view_announcements: 'true', can_view_my_referrals: 'true', can_view_open_roles: 'true',
    checklist_scope: 'own', home_content_manage: 'true',
  },
}

function permissionsCacheKey(email) {
  return `permissions_cache_${String(email || '').trim().toLowerCase()}`
}

export function readPermissionsCache(email) {
  try {
    const raw = localStorage.getItem(permissionsCacheKey(email))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function writePermissionsCache(email, permissions) {
  try {
    localStorage.setItem(permissionsCacheKey(email), JSON.stringify(permissions))
  } catch {
    // quota exceeded / storage disabled — fallback just won't have a cache to use
  }
}

export function clearPermissionsCache(email) {
  try {
    localStorage.removeItem(permissionsCacheKey(email))
  } catch {
    /* localStorage may be unavailable — ignore */
  }
}

export function buildFallbackPermissions(rawRole, email) {
  const r = String(rawRole || 'employee').toLowerCase().trim()
  const defaults = ROLE_DEFAULT_PERMISSIONS[r] || ROLE_DEFAULT_PERMISSIONS.employee
  const cached = readPermissionsCache(email)
  if (cached) {
    return { ...defaults, ...cached } // cached DB-fetched values win over role defaults
  }
  return { ...defaults }
}

// Retries the permissions call a couple of times before the caller falls back
// to role defaults — see the limitation noted above buildFallbackPermissions.
export async function fetchPermissionsWithRetry(email, attempts = 3) {
  let lastErr
  for (let i = 0; i < attempts; i++) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 8000)
    try {
      const res = await fetch(`${PAPI_URL}/api/permissions?email=${encodeURIComponent(email)}`, {
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      if (res.ok || i === attempts - 1) return res
    } catch (e) {
      clearTimeout(timeoutId)
      lastErr = e
      if (i === attempts - 1) throw lastErr
    }
    await new Promise((r) => setTimeout(r, 500 * (i + 1))) // 500ms, then 1000ms
  }
}
