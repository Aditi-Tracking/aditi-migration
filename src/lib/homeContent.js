import { SB_HDRS, SUPABASE_URL } from './supabaseClient'

// Ported from old-portal/js/homeContent.js — HR-editable Home page card
// sections (home_content_sections/home_content_items tables).

const HDRS_MIN = () => ({ ...SB_HDRS(), 'Content-Type': 'application/json', Prefer: 'return=minimal' })

export const ICON_PRESETS = ['🏆', '🌱', '🎉', '⭐', '🏅', '👏', '🎂', '📢', '🎯', '🌟', '💡', '🙌']
export const ACCENT_PRESETS = [
  { key: 'blue', hex: '#4e9af1' },
  { key: 'teal', hex: '#00d4aa' },
  { key: 'orange', hex: '#f0a500' },
  { key: 'pink', hex: '#ff5c7c' },
  { key: 'purple', hex: '#a78bfa' },
  { key: 'gold', hex: '#ffcc44' },
]

export function accentHex(key) {
  return ACCENT_PRESETS.find((c) => c.key === key)?.hex || '#00d4aa'
}

export async function fetchSections() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/home_content_sections?select=*&is_active=eq.true&order=display_order.asc`,
    { headers: SB_HDRS() }
  )
  if (!res.ok) throw new Error('Failed to load Home content sections')
  return res.json()
}

export async function fetchItemsForSections(sectionIds) {
  if (!sectionIds.length) return []
  const ids = sectionIds.join(',')
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/home_content_items?select=*&is_active=eq.true&section_id=in.(${ids})&order=display_order.asc`,
    { headers: SB_HDRS() }
  )
  if (!res.ok) throw new Error('Failed to load Home content items')
  return res.json()
}

export async function renameSection(sectionId, title) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/home_content_sections?id=eq.${sectionId}`, {
    method: 'PATCH',
    headers: HDRS_MIN(),
    body: JSON.stringify({ title, updated_at: new Date().toISOString() }),
  })
  if (!res.ok) throw new Error(await res.text())
}

export async function deactivateSection(sectionId) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/home_content_sections?id=eq.${sectionId}`, {
    method: 'PATCH',
    headers: HDRS_MIN(),
    body: JSON.stringify({ is_active: false, updated_at: new Date().toISOString() }),
  })
  if (!res.ok) throw new Error(await res.text())
}

export async function createSection({ title, icon, accent_color, displayOrder, createdBy }) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/home_content_sections`, {
    method: 'POST',
    headers: HDRS_MIN(),
    body: JSON.stringify({ title, icon, accent_color, display_order: displayOrder, created_by: createdBy }),
  })
  if (!res.ok) throw new Error(await res.text())
}

export async function removeItem(itemId) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/home_content_items?id=eq.${itemId}`, {
    method: 'PATCH',
    headers: HDRS_MIN(),
    body: JSON.stringify({ is_active: false, updated_at: new Date().toISOString() }),
  })
  if (!res.ok) throw new Error(await res.text())
}

export async function addItem({ sectionId, employee, extraLabel, displayOrder, createdBy }) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/home_content_items`, {
    method: 'POST',
    headers: HDRS_MIN(),
    body: JSON.stringify({
      section_id: sectionId,
      employee_name: employee.Employee_name,
      subtitle: employee.Employee_Dept || null,
      location: employee.Location || null,
      extra_label: extraLabel || null,
      photo_url: employee.avatar_url || employee.Link || null,
      display_order: displayOrder,
      created_by: createdBy,
    }),
  })
  if (!res.ok) throw new Error(await res.text())
}

export async function fetchEmployeeDirectory() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/Employee_details?select=Employee_name,Employee_Dept,Location,avatar_url,Link&order=Employee_name.asc`,
    { headers: SB_HDRS() }
  )
  if (!res.ok) return []
  const rows = await res.json()
  return Array.isArray(rows) ? rows : []
}
