// Universal Upload/Delete subsystem for every content_nodes-backed module (HR, Sales, After
// Sales, Finance, Products, Marketing, IT Admin, Training, Resources). Ported from
// old-portal/js/upload.js's openUploadModal/submitUpload/_submitYoutubeLink/createCardOnly/
// confirmDeleteCard/confirmDeleteFile.
//
// Permission is a single flag, `can_upload_files` — the old-portal gate function is misleadingly
// named `_isMIS()` but actually checks this permission, not a role string. Confirmed only the
// `mis` role gets it by default (owner does NOT), unlike almost every other permission in this
// app — no role-string bypass here, ported byte-for-byte as a plain permission check.
import { CN } from './contentNodes'
import { SB_HDRS, SB_HDRS_JSON, SUPABASE_URL, getAuthToken, SUPABASE_ANON } from './supabaseClient'

const BUCKET = 'files'

export function canUploadFiles(permissions) {
  return permissions?.can_upload_files === 'true'
}

// Resets the CN singleton so the next CN.load() re-fetches fresh content_nodes/files —
// called after any upload or delete succeeds.
export async function invalidateContentNodes() {
  CN.loaded = false
  CN.nodes = []
  CN.files = []
  await CN.load()
}

// Recursively flattens a section's whole card tree (top-level + every nested sub-card, any
// depth) into a flat list with an indent prefix per level — lets a file be uploaded into, or a
// new card nested under, a card at any depth, not just top-level ones.
export function flattenCardTree(parentId, depth = 0) {
  const prefix = depth > 0 ? '— '.repeat(depth) : ''
  let out = []
  CN.getCategories(parentId).forEach((c) => {
    const name = c.name || c.Name || 'Category'
    out.push({ id: c.id, label: prefix + name })
    out = out.concat(flattenCardTree(c.id, depth + 1))
  })
  return out
}

function classifyFileType(filename) {
  const ext = (filename.split('.').pop() || '').toLowerCase()
  if (['pdf'].includes(ext)) return 'pdf'
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return 'image'
  if (['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext)) return 'video'
  if (['mp3', 'wav', 'aac', 'ogg'].includes(ext)) return 'audio'
  // 'doc' is NOT in the files table's file_type CHECK constraint — Office docs (ppt/xls/doc,
  // etc) fall back to the generic 'file' type the constraint does allow, same as anything else
  // unmatched.
  return 'file'
}

export function extractYoutubeId(url) {
  const m = (url || '').match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/)
  return m ? m[1] : null
}

async function createContentNode({ name, type, parentId }) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/content_nodes`, {
    method: 'POST',
    headers: { ...SB_HDRS_JSON(), Prefer: 'return=representation' },
    body: JSON.stringify({ name, type, parent_id: parentId }),
  })
  if (!res.ok) throw new Error('Card create failed (HTTP ' + res.status + ')')
  const data = await res.json()
  return Array.isArray(data) ? data[0].id : data.id
}

// Resolves the target content_nodes id for an upload/create-card action, creating the section
// and/or category rows as needed. Mirrors submitUpload's Step 1 exactly.
export async function resolveTargetNode({ section, mode, existingNodeId, newCardType, newCardName, newSubParentId }) {
  await CN.load()
  if (mode === 'existing') {
    if (!existingNodeId) throw new Error('Please select a card.')
    return existingNodeId
  }
  // mode === 'new'
  if (!newCardName) throw new Error('Please enter a card name.')
  let parentId
  if (newCardType === 'sub') {
    if (!newSubParentId) throw new Error('Please select a parent card.')
    parentId = newSubParentId
  } else {
    const existingSection = CN.getSection(section)
    parentId = existingSection ? existingSection.id : await createContentNode({ name: section, type: 'section', parentId: null })
  }
  return createContentNode({ name: newCardName, type: 'category', parentId })
}

export async function createCardOnly({ section, newCardType, newCardName, newSubParentId }) {
  return resolveTargetNode({ section, mode: 'new', newCardType, newCardName, newSubParentId })
}

// Real per-file XHR progress (kept as XMLHttpRequest, not this project's usual fetch()
// substitution — same rationale already approved for Field Service's photo upload: onprogress
// drives a real, visible percentage that fetch() can't produce).
function uploadFileToStorage(section, nodeId, file, onProgress) {
  return new Promise((resolve, reject) => {
    const ts = Date.now()
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${section.replace(/\s+/g, '_')}/${nodeId}/${ts}_${safeName}`
    const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.setRequestHeader('apikey', SUPABASE_ANON)
    xhr.setRequestHeader('Authorization', `Bearer ${getAuthToken()}`)
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
    xhr.setRequestHeader('x-upsert', 'false')
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable && onProgress) onProgress(Math.round((ev.loaded / ev.total) * 100))
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(path)
      else reject(new Error('Storage upload failed (HTTP ' + xhr.status + ')'))
    }
    xhr.onerror = () => reject(new Error('Network error during upload'))
    xhr.send(file)
  })
}

async function insertFileRow({ nodeId, name, fileType, fileUrl }) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/files`, {
    method: 'POST',
    headers: { ...SB_HDRS_JSON(), Prefer: 'return=minimal' },
    body: JSON.stringify({ node_id: nodeId, name, file_type: fileType, file_url: fileUrl }),
  })
  if (!res.ok) throw new Error('Could not save file record (HTTP ' + res.status + ')')
}

// Uploads one or more files into a resolved node, one at a time. `onFileProgress(index, pct)`
// reports per-file progress; multi-file display names are auto-derived from the filename
// (strip extension, underscores/dashes -> spaces) — the manual display-name field only applies
// in single-file mode, matching production exactly.
export async function uploadFiles({ section, nodeId, files, displayName, onFileProgress }) {
  const isMulti = files.length > 1
  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const name = isMulti ? file.name.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ') : displayName
    const path = await uploadFileToStorage(section, nodeId, file, (pct) => onFileProgress?.(i, pct))
    const fileUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`
    await insertFileRow({ nodeId, name, fileType: classifyFileType(file.name), fileUrl })
  }
}

export async function saveYoutubeLink({ nodeId, displayName, youtubeUrl }) {
  await insertFileRow({ nodeId, name: displayName, fileType: 'video', fileUrl: youtubeUrl })
}

// ── Delete ───────────────────────────────────────────────────────────────────
async function deleteStorageObject(fileUrl) {
  const marker = `/storage/v1/object/public/${BUCKET}/`
  if (!fileUrl || !fileUrl.includes(marker)) return // YouTube links have no storage object
  const path = fileUrl.split(marker)[1]
  if (!path) return
  await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, { method: 'DELETE', headers: SB_HDRS() }).catch(() => {})
}

async function deleteFilesOfNode(nodeId) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/files?node_id=eq.${nodeId}`, { headers: SB_HDRS() })
  const files = res.ok ? await res.json() : []
  for (const f of files) {
    await deleteStorageObject(f.file_url || f.url || f.link || '')
  }
  if (files.length) {
    await fetch(`${SUPABASE_URL}/rest/v1/files?node_id=eq.${nodeId}`, { method: 'DELETE', headers: SB_HDRS() }).catch(() => {})
  }
}

async function collectDescendantIds(rootId) {
  const allIds = []
  const queue = [rootId]
  while (queue.length) {
    const cur = queue.shift()
    const res = await fetch(`${SUPABASE_URL}/rest/v1/content_nodes?parent_id=eq.${cur}&select=id`, { headers: SB_HDRS() })
    const children = res.ok ? await res.json() : []
    for (const c of children) {
      allIds.push(c.id)
      queue.push(c.id)
    }
  }
  return allIds
}

// Full recursive cascade: every descendant category's files (storage + DB rows) and node rows,
// deepest-first, then the root card's own files and node row. A card with nested sub-cards is
// genuinely wiped whole, matching production exactly.
export async function deleteContentNodeCard(nodeId) {
  const descendants = await collectDescendantIds(nodeId)
  const deleteOrder = [...descendants].reverse()
  for (const id of deleteOrder) {
    await deleteFilesOfNode(id)
    const res = await fetch(`${SUPABASE_URL}/rest/v1/content_nodes?id=eq.${id}`, { method: 'DELETE', headers: SB_HDRS() })
    if (!res.ok) throw new Error('Permission denied deleting a sub-card. Contact MIS.')
  }
  await deleteFilesOfNode(nodeId)
  const res = await fetch(`${SUPABASE_URL}/rest/v1/content_nodes?id=eq.${nodeId}`, { method: 'DELETE', headers: SB_HDRS() })
  if (!res.ok) throw new Error('Permission denied. Contact MIS.')
}

// Deletes only the file (storage object + files row) — the parent card is deliberately left
// untouched even if this was its last file, matching production exactly (an empty card stays
// behind until someone separately deletes the card itself).
export async function deleteContentNodeFile(fileId, fileUrl) {
  await deleteStorageObject(fileUrl)
  const res = await fetch(`${SUPABASE_URL}/rest/v1/files?id=eq.${fileId}`, { method: 'DELETE', headers: SB_HDRS() })
  if (!res.ok) throw new Error('Permission denied. Contact MIS.')
}
