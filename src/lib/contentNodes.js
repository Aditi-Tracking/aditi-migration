import { SB_HDRS, SUPABASE_URL } from './supabaseClient'

// Ported from old-portal/js/shared.js's CN object — universal CMS used by
// HR, Sales, After Sales, Products, IT Admin, Resources, etc. Same table
// names/fields/order as the original. Kept as a module-level singleton
// (not React state) intentionally, mirroring the old global `CN` object —
// callers `await CN.load()` then read from it, same imperative pattern.
function get(row, ...names) {
  const keys = Object.keys(row)
  for (const n of names) {
    const k = keys.find((key) => key.toLowerCase() === n.toLowerCase())
    if (k !== undefined && row[k] !== null && row[k] !== undefined) return String(row[k]).trim()
  }
  return ''
}

export const CN = {
  nodes: [],
  files: [],
  loaded: false,
  loading: false,
  callbacks: [],

  async load() {
    // Smart reset: agar pehle load empty aaya tha (anon token se) toh dobara fetch karo
    if (this.loaded && this.nodes.length === 0) {
      this.loaded = false
    }
    if (this.loaded) return
    if (this.loading) return new Promise((res) => this.callbacks.push(res))
    this.loading = true
    try {
      const [nodesRes, filesRes] = await Promise.all([
        fetch(`${SUPABASE_URL}/rest/v1/content_nodes?select=*&order=id.asc`, { headers: SB_HDRS() }),
        fetch(`${SUPABASE_URL}/rest/v1/files?select=*&order=id.asc`, { headers: SB_HDRS() }),
      ])
      if (!nodesRes.ok) throw new Error('content_nodes: HTTP ' + nodesRes.status)
      if (!filesRes.ok) throw new Error('files: HTTP ' + filesRes.status)
      this.nodes = await nodesRes.json()
      this.files = await filesRes.json()
      this.loaded = true
    } finally {
      this.loading = false
      this.callbacks.splice(0).forEach((cb) => cb())
    }
  },

  getSections() {
    return this.nodes.filter((n) => (n.type || n.Type || '').toLowerCase() === 'section')
  },

  getSection(name) {
    return this.nodes.find(
      (n) =>
        (n.type || n.Type || '').toLowerCase() === 'section' &&
        (n.name || n.Name || '').trim().toLowerCase() === name.trim().toLowerCase()
    )
  },

  getCategories(parentId) {
    return this.nodes.filter((n) => {
      const pid = n.parent_id !== undefined ? n.parent_id : n.Parent_id
      return String(pid) === String(parentId)
    })
  },

  getFiles(nodeId) {
    return this.files
      .filter((f) => {
        const nid =
          f.node_id !== undefined
            ? f.node_id
            : f.Node_id !== undefined
              ? f.Node_id
              : f.content_node_id !== undefined
                ? f.content_node_id
                : null
        return String(nid) === String(nodeId)
      })
      .map((f) => ({
        id: f.id,
        name: get(f, 'name', 'title', 'file_name', 'Doc_Name') || 'Document',
        url: get(f, 'file_url', 'url', 'link', 'Doc_Link', 'file_link'),
      }))
  },

  getNodeById(id) {
    return this.nodes.find((n) => String(n.id) === String(id))
  },

  totalFiles(nodeId) {
    const direct = this.getFiles(nodeId).length
    const kids = this.getCategories(nodeId).reduce((s, c) => s + this.getFiles(c.id).length, 0)
    return direct + kids
  },
}
