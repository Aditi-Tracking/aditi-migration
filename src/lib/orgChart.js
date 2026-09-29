// Org Chart (HR section) — a new, database-driven feature, not a port from old-portal (which had
// this as a static CMS document picker, now replaced entirely — see OrgChartOverlay.jsx).
// `org_chart_nodes` (id, emp_id -> Employee_details.Emp_id, display_role, manager_id -> org_chart_nodes.id)
// is a manually-curated overlay table: HR explicitly adds/removes people rather than the chart being
// derived from any employment-status field. Employee_details was chosen as the source of truth over
// the newer `employees` (HR Employee Master) table because it's the one with full company-wide
// coverage of all current staff — confirmed during investigation, see MIGRATION-NOTES.md's general
// note on `employees`/Employee_details being two independent, unlinked tables.
import { SUPABASE_URL, SB_HDRS, SB_HDRS_MIN, SB_HDRS_REPR } from './supabaseClient'
import { normalizeHolidayLocation } from './holidayLocation'

export const BRANCHES = [
  { key: 'Mumbai', label: 'Head Office' },
  { key: 'Goa', label: 'Goa' },
  { key: 'Bangalore', label: 'Bangalore' },
  { key: 'Gujarat', label: 'Gujarat' },
]

const BRANCH_KEYS = new Set(BRANCHES.map((b) => b.key))

// normalizeHolidayLocation() was built for the Holiday List's location scoping, where an
// unrecognized/blank value falling back to 'All' is meaningful (a holiday applies everywhere).
// Reused here for its Goa/Bangalore/Gujarat/Mumbai matching, but that same fallback isn't one of
// our 4 branch buckets — an employee with a blank or unrecognized Location (real for some
// leadership/admin records) would silently vanish from every branch's roots list *and* every
// manager-search dropdown, including Head Office's own tab. Defaulting the fallback to Mumbai
// (Head Office) keeps every org-chart member visible somewhere rather than disappearing.
export function branchLocation(rawLocation) {
  const normalized = normalizeHolidayLocation(rawLocation)
  return BRANCH_KEYS.has(normalized) ? normalized : 'Mumbai'
}

// Shared color presets — used today only by group headings' bg_color, but built as a single
// reusable picker/preset set (not a group-specific one) since node recoloring (Phase 4) will want
// the exact same palette rather than a second, inconsistent one.
export const COLOR_PRESETS = [
  { key: 'primary', label: 'Blue', swatch: 'bg-primary', bg: 'bg-primary-tint', border: 'border-primary/40' },
  { key: 'violet', label: 'Violet', swatch: 'bg-depth-violet', bg: 'bg-depth-violet-tint', border: 'border-depth-violet/40' },
  { key: 'teal', label: 'Teal', swatch: 'bg-depth-teal', bg: 'bg-depth-teal-tint', border: 'border-depth-teal/40' },
  { key: 'amber', label: 'Amber', swatch: 'bg-depth-amber', bg: 'bg-depth-amber-tint', border: 'border-depth-amber/40' },
  { key: 'neutral', label: 'Neutral', swatch: 'bg-text-muted', bg: 'bg-surface-2', border: 'border-border' },
]

export function getColorPreset(key) {
  return COLOR_PRESETS.find((p) => p.key === key) || COLOR_PRESETS[0]
}

// Heading label size — a plain unconstrained INTEGER column (org_chart_groups.font_size), same
// precedent as bg_color/branch: valid values live only in this app-level constant, not enforced
// in Postgres.
export const FONT_SIZE_PRESETS = [
  { key: 'S', label: 'Small', value: 20 },
  { key: 'M', label: 'Medium', value: 28 },
  { key: 'L', label: 'Large', value: 36 },
  { key: 'XL', label: 'X-Large', value: 48 },
]

export function getFontSizePreset(value) {
  return FONT_SIZE_PRESETS.find((p) => p.value === value) || FONT_SIZE_PRESETS[2]
}

// A TBA (placeholder) row has no employee, so `name` is null — every call site that renders or
// searches a row's human-readable label (manager pickers, the detail popup) must use this instead
// of reading `.name` directly, or it'll crash on a TBA row (`null.toLowerCase()`) or silently
// render blank.
export function rowLabel(row) {
  return row.name || row.display_role || '(unnamed)'
}

function role(currentUser) {
  return String(currentUser?.rawRole || currentUser?.role || '').toLowerCase().trim()
}

export function canManageOrgChart(currentUser, permissions) {
  if (permissions?.hr_org_chart_manage === 'true') return true
  const r = role(currentUser)
  return r === 'owner' || r === 'mis'
}

// ── Fetch ─────────────────────────────────────────────────────────────────────
export async function fetchOrgChartData() {
  const [nodesRes, empRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/org_chart_nodes?select=*`, { headers: SB_HDRS() }),
    fetch(`${SUPABASE_URL}/rest/v1/Employee_details?select=Emp_id,Employee_name,Employee_Dept,Location`, { headers: SB_HDRS() }),
  ])
  if (!nodesRes.ok) throw new Error(await nodesRes.text())
  if (!empRes.ok) throw new Error(await empRes.text())
  const nodes = await nodesRes.json()
  const employeesList = await empRes.json()
  const employeesById = {}
  employeesList.forEach((e) => {
    employeesById[e.Emp_id] = e
  })
  return { nodes, employeesById, employeesList }
}

// Groups are a genuinely separate concern from nodes (no containment/ownership of members — see
// project notes), fetched independently and scoped server-side by branch rather than bundled
// into the heavier combined node/employee fetch above.
export async function fetchOrgChartGroups(branch) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/org_chart_groups?branch=eq.${encodeURIComponent(branch)}&select=*`, {
    headers: SB_HDRS(),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

// ── Tree building ─────────────────────────────────────────────────────────────
// Enriches raw org_chart_nodes rows with the employee's name/department/normalized
// location (joined client-side, matching this codebase's established flat-fetch-then-join
// convention — see hrEmployee.js's fetchAll), and builds the manager_id -> children lookup
// the recursive renderer walks.
export function buildTree(nodes, employeesById) {
  const rows = nodes.map((n) => {
    const isTBA = n.emp_id == null
    const emp = isTBA ? null : employeesById[n.emp_id] || {}
    return {
      id: n.id,
      emp_id: n.emp_id,
      manager_id: n.manager_id,
      display_role: n.display_role,
      is_tba: isTBA,
      // A TBA row has no employee at all — name stays null (never '(unknown employee)', which
      // means something different: a real emp_id that no longer resolves to an Employee_details
      // row, a data problem, not an intentional placeholder). Its branch comes from the node's
      // own `branch` column instead of an employee's Location, since there's no employee to read
      // one from — see the org_chart_nodes_emp_or_tba_check constraint.
      name: isTBA ? null : emp.Employee_name || '(unknown employee)',
      department: isTBA ? '' : emp.Employee_Dept || '',
      location: isTBA ? branchLocation(n.branch) : branchLocation(emp.Location),
      position_x: n.position_x,
      position_y: n.position_y,
      width: n.width,
      height: n.height,
    }
  })
  const byId = new Map(rows.map((r) => [r.id, r]))
  const childrenByManager = new Map()
  rows.forEach((r) => {
    const key = r.manager_id || null
    if (!childrenByManager.has(key)) childrenByManager.set(key, [])
    childrenByManager.get(key).push(r)
  })
  return { rows, byId, childrenByManager }
}

// A node is a visible root for `branch` if it has no manager, or its manager is in a
// different (normalized) location. In the latter case the caller renders a static
// branch-name header (using the out-of-branch manager's own location) in place of that
// manager node, which is not rendered.
export function getVisibleRoots(rows, byId, branch) {
  return rows
    .filter((r) => r.location === branch)
    .filter((r) => !r.manager_id || byId.get(r.manager_id)?.location !== branch)
    .map((r) => {
      const mgr = r.manager_id ? byId.get(r.manager_id) : null
      return { row: r, crossBranch: !!mgr, managerLocation: mgr?.location || null }
    })
}

// Flattens a branch's visible roots + every descendant reachable through childrenByManager into
// a plain node/edge list for React Flow + dagre (Phase 1: rendering engine only, positions are
// computed live, not yet persisted). Also tracks each node's BFS depth for the existing per-level
// color coding — computed here rather than trusting dagre's internal rank field, since that's an
// implementation detail of dagre's layout algorithm, not documented public API.
//
// `seen` marks a node the moment it's ENQUEUED (not when dequeued) specifically to guard against
// a cycle in manager_id data (e.g. two nodes manually reparented to point at each other through
// some sequence of edits) — dagre's ranking algorithm expects a DAG and can misbehave or throw on
// a cyclic graph. Under normal single-parent data this is a no-op (a node is only ever discovered
// once anyway); it only matters if manager_id data is ever inconsistent.
export function collectBranchNodesAndEdges(rootsWithMeta, childrenByManager) {
  const nodes = []
  const edges = []
  const depthById = new Map()
  const seen = new Set()
  const queue = []
  rootsWithMeta.forEach((r) => {
    seen.add(r.row.id)
    queue.push({ node: r.row, depth: 0 })
  })
  while (queue.length) {
    const { node, depth } = queue.shift()
    depthById.set(node.id, depth)
    nodes.push(node)
    const kids = childrenByManager.get(node.id) || []
    kids.forEach((k) => {
      if (seen.has(k.id)) return
      seen.add(k.id)
      edges.push({ source: node.id, target: k.id })
      queue.push({ node: k, depth: depth + 1 })
    })
  }
  return { nodes, edges, depthById }
}

// Used to prevent reparenting a node under one of its own descendants (would create a cycle).
export function getDescendantIds(nodeId, childrenByManager) {
  const result = new Set()
  const stack = [nodeId]
  while (stack.length) {
    const cur = stack.pop()
    const kids = childrenByManager.get(cur) || []
    kids.forEach((k) => {
      if (!result.has(k.id)) {
        result.add(k.id)
        stack.push(k.id)
      }
    })
  }
  return result
}

// ── Mutations ─────────────────────────────────────────────────────────────────
// `empId` omitted/null + `branch` set creates a TBA (placeholder) row instead of a real one —
// see the org_chart_nodes_emp_or_tba_check constraint. `branch` is ignored/unused for a real node
// (which derives its branch from the linked employee's Location instead).
export async function addOrgChartNode({ empId, managerId, displayRole, branch }) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/org_chart_nodes`, {
    method: 'POST',
    headers: SB_HDRS_REPR(),
    body: JSON.stringify({
      emp_id: empId ?? null,
      manager_id: managerId || null,
      display_role: displayRole || null,
      branch: branch || null,
    }),
  })
  if (!res.ok) throw new Error(await res.text())
  const [saved] = await res.json()
  return saved
}

// `empId` here is the fill-in-place conversion path: attaching a real employee to an existing TBA
// row (UPDATE, not delete+recreate), so position_x/position_y and any org_chart_edges pointing to
// this node's id are preserved automatically.
export async function updateOrgChartNode(nodeId, { managerId, displayRole, empId } = {}) {
  const payload = {}
  if (managerId !== undefined) payload.manager_id = managerId || null
  if (displayRole !== undefined) payload.display_role = displayRole || null
  if (empId !== undefined) payload.emp_id = empId
  const res = await fetch(`${SUPABASE_URL}/rest/v1/org_chart_nodes?id=eq.${nodeId}`, {
    method: 'PATCH',
    headers: SB_HDRS_MIN(),
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await res.text())
}

// Adds many people at once under the same manager (the "pick a manager, check all their direct
// reports, save" bulk workflow) — a thin loop over addOrgChartNode, reporting per-person
// success/failure rather than all-or-nothing, since one bad row (e.g. a duplicate emp_id race)
// shouldn't silently discard the rest of a 20-person batch.
export async function bulkAddOrgChartNodes(entries, managerId) {
  const results = await Promise.allSettled(
    entries.map((e) => addOrgChartNode({ empId: e.empId, managerId, displayRole: e.displayRole }))
  )
  const failures = []
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      failures.push({ empId: entries[i].empId, name: entries[i].name, error: r.reason?.message || String(r.reason) })
    }
  })
  return { successCount: results.length - failures.length, failures }
}

// Persists a drag-to-reposition move. Separate from updateOrgChartNode (which handles the
// manager/display_role picker) since this fires on every drag-stop — keeping it a single-purpose,
// minimal-payload PATCH.
export async function updateNodePosition(nodeId, x, y) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/org_chart_nodes?id=eq.${nodeId}`, {
    method: 'PATCH',
    headers: SB_HDRS_MIN(),
    body: JSON.stringify({ position_x: x, position_y: y }),
  })
  if (!res.ok) throw new Error(await res.text())
}

// ── Groups (department headings) ─────────────────────────────────────────────
// org_chart_groups is a plain background-colored label box HR positions near a cluster of
// people — no containment/ownership of member nodes, confirmed deliberately (see project notes).
export async function addOrgChartGroup({ branch, label, positionX, positionY, width = 300, height = 200 }) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/org_chart_groups`, {
    method: 'POST',
    headers: SB_HDRS_REPR(),
    body: JSON.stringify({ branch, label, position_x: positionX, position_y: positionY, width, height }),
  })
  if (!res.ok) throw new Error(await res.text())
  const [saved] = await res.json()
  return saved
}

export async function updateOrgChartGroup(id, { label, positionX, positionY, width, height, bgColor, fontSize } = {}) {
  const payload = {}
  if (label !== undefined) payload.label = label
  if (positionX !== undefined) payload.position_x = positionX
  if (positionY !== undefined) payload.position_y = positionY
  if (width !== undefined) payload.width = width
  if (height !== undefined) payload.height = height
  if (bgColor !== undefined) payload.bg_color = bgColor
  if (fontSize !== undefined) payload.font_size = fontSize
  const res = await fetch(`${SUPABASE_URL}/rest/v1/org_chart_groups?id=eq.${id}`, {
    method: 'PATCH',
    headers: SB_HDRS_MIN(),
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await res.text())
}

export async function removeOrgChartGroup(id) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/org_chart_groups?id=eq.${id}`, {
    method: 'DELETE',
    headers: SB_HDRS_MIN(),
  })
  if (!res.ok) throw new Error(await res.text())
}

// Removing a node reassigns its direct reports up to its own manager (root if it had none) —
// the standard org-chart "remove" convention, confirmed with the user over blocking removal
// until reports are manually reassigned.
export async function removeOrgChartNode(node, rows) {
  const directReports = rows.filter((r) => r.manager_id === node.id)
  await Promise.all(
    directReports.map((r) =>
      fetch(`${SUPABASE_URL}/rest/v1/org_chart_nodes?id=eq.${r.id}`, {
        method: 'PATCH',
        headers: SB_HDRS_MIN(),
        body: JSON.stringify({ manager_id: node.manager_id || null }),
      })
    )
  )
  const res = await fetch(`${SUPABASE_URL}/rest/v1/org_chart_nodes?id=eq.${node.id}`, {
    method: 'DELETE',
    headers: SB_HDRS_MIN(),
  })
  if (!res.ok) throw new Error(await res.text())
}
