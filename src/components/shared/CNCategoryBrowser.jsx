import { useState } from 'react'
import { CN } from '../../lib/contentNodes'
import { useFileViewer } from '../../context/FileViewerContext'
import { deleteContentNodeCard, deleteContentNodeFile, invalidateContentNodes } from '../../lib/cnUploadDelete'
import { DOC_ICON, PDF_ICON, VIDEO_ICON } from './docIcons'

// Ported from old-portal/js/shared.js's _cnRenderOverlayContent — generic
// sub-category/file drill-down browser reused by every content-nodes-backed
// overlay (HR Docs, Training's Videos tab, and every CNSectionPanel consumer).
// `canDelete`/`onContentChanged`, when passed by the caller (gated on
// canUploadFiles(permissions)), render the per-row delete buttons ported from
// _cnRenderOverlayContent's sub-card delBtn and renderOverlayCard's delFileBtn.
function fileCardMeta(url) {
  const ext = (url || '').split('?')[0].split('.').pop().toLowerCase()
  const ytMatch = (url || '').match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/)
  const isYt = !!ytMatch
  const isVid = ['mp4', 'webm', 'mov'].includes(ext)
  const isPdf = ext === 'pdf'
  const label = isYt ? '▶ YouTube' : isVid ? '🎬 Video' : isPdf ? '📄 PDF' : '📁 Open'
  // Scoped icon-color exception (PDF/video only) — see docIcons.jsx's PDF_ICON/VIDEO_ICON comment.
  const bg = isPdf ? '#f87171' : isVid ? '#a78bfa' : null
  const icon = isPdf ? PDF_ICON : isVid ? VIDEO_ICON : null
  return { isYt, ytId: ytMatch?.[1] || null, isVid, isPdf, label, bg, icon }
}

const FOLDER_ICON = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
)

// Shared card for both sub-folder and leaf file/video items — same icon size/shape regardless of
// depth, so drilling into a folder never feels different from the level above it (matches
// DocCard's proportions: p-4, rounded-xl, 48px icon). `thumbnail` (YouTube only) replaces the
// icon square entirely; `iconStyle` carries the scoped PDF/video color exception from
// fileCardMeta above — everything else (folders, generic files) stays the default blue.
function CNItemCard({ icon, iconClassName, iconStyle, name, badge, onClick, onDelete, deleting, thumbnail }) {
  return (
    <div className="relative">
      {onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          disabled={deleting}
          title="Delete"
          className="absolute top-1.5 right-1.5 z-10 w-6 h-6 rounded-md bg-danger-tint border border-danger/30 text-danger flex items-center justify-center hover:bg-danger/20 disabled:opacity-60"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
            <path d="M10 11v6M14 11v6" />
            <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
          </svg>
        </button>
      )}
      <button
        type="button"
        onClick={onClick}
        className="w-full h-full flex flex-col items-start gap-3 rounded-xl border border-border bg-surface-2 p-4 text-left hover:border-primary/40 hover:shadow-sm transition-all"
      >
        {thumbnail || (
          <div className={`w-12 h-12 rounded-lg flex items-center justify-center shrink-0 ${iconClassName || ''}`} style={iconStyle}>
            {icon}
          </div>
        )}
        <div className="text-[13px] font-medium text-text leading-snug line-clamp-2">{name}</div>
        <span className="mt-auto text-[10.5px] font-medium text-primary bg-primary-tint border border-primary/20 rounded-full px-2.5 py-1">
          {badge}
        </span>
      </button>
    </div>
  )
}

export default function CNCategoryBrowser({ rootNodeId, rootName, canDelete = false, onContentChanged }) {
  const { openFileViewer } = useFileViewer()
  const [stack, setStack] = useState([]) // ancestors, oldest first: [{id, name}]
  const [current, setCurrent] = useState({ id: rootNodeId, name: rootName })
  const [, setRefreshTick] = useState(0) // bumped after a delete so CN's fresh nodes/files re-render
  const [deletingId, setDeletingId] = useState(null)

  const subCards = CN.getCategories(current.id)
  const files = CN.getFiles(current.id)
  const parent = stack.length ? stack[stack.length - 1] : null
  const totalItems = subCards.length + files.length

  function drillDown(sc) {
    setStack((s) => [...s, current])
    setCurrent({ id: sc.id, name: sc.name || sc.Name || 'Sub-card' })
  }

  function goBack() {
    if (!parent) return
    setCurrent(parent)
    setStack((s) => s.slice(0, -1))
  }

  // Ported from confirmDeleteCard — a real recursive cascade (every nested sub-card + all their
  // files, deepest-first) when `sc` itself has sub-cards.
  async function handleDeleteSubCard(sc) {
    const name = sc.name || sc.Name || 'Sub-card'
    if (!confirm(`⚠️ "${name}" and all its files will be permanently deleted.\nAre you sure?`)) return
    setDeletingId(sc.id)
    try {
      await deleteContentNodeCard(sc.id)
      await invalidateContentNodes()
      onContentChanged?.()
      setRefreshTick((t) => t + 1)
    } catch (e) {
      alert('❌ ' + e.message)
    } finally {
      setDeletingId(null)
    }
  }

  // Ported from confirmDeleteFile — the parent card is deliberately left untouched even if this
  // was its last file.
  async function handleDeleteFile(f) {
    if (!confirm('⚠️ This file will be permanently deleted. Are you sure?')) return
    setDeletingId(f.id)
    try {
      await deleteContentNodeFile(f.id, f.url)
      await invalidateContentNodes()
      onContentChanged?.()
      setRefreshTick((t) => t + 1)
    } catch (e) {
      alert('❌ ' + e.message)
    } finally {
      setDeletingId(null)
    }
  }

  if (!totalItems) {
    return (
      <div>
        {parent && <BackButton parent={parent} onClick={goBack} />}
        <div className="text-center py-10 text-text-muted text-[12.5px]">No documents found.</div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {parent && (
        <div className="col-span-full">
          <BackButton parent={parent} onClick={goBack} />
        </div>
      )}

      {subCards.length > 0 && (
        <div className="col-span-full text-[10.5px] font-semibold text-text-muted uppercase tracking-wide">
          Sub-Cards
        </div>
      )}
      {subCards.map((sc) => {
        const name = sc.name || sc.Name || 'Sub-card'
        const count = CN.totalFiles(sc.id)
        return (
          <CNItemCard
            key={sc.id}
            icon={FOLDER_ICON}
            iconClassName="bg-primary-tint border border-primary/20 text-primary"
            name={name}
            badge={`${count} file${count === 1 ? '' : 's'}`}
            onClick={() => drillDown(sc)}
            onDelete={canDelete ? () => handleDeleteSubCard(sc) : undefined}
            deleting={deletingId === sc.id}
          />
        )
      })}

      {subCards.length > 0 && files.length > 0 && (
        <div className="col-span-full text-[10.5px] font-semibold text-text-muted uppercase tracking-wide mt-1">
          Files
        </div>
      )}
      {files.map((f) => {
        const meta = fileCardMeta(f.url)
        return (
          <CNItemCard
            key={f.id}
            icon={meta.icon || DOC_ICON}
            iconClassName={meta.icon ? 'text-white' : 'bg-primary-tint border border-primary/20 text-primary'}
            iconStyle={meta.bg ? { background: meta.bg } : undefined}
            name={f.name}
            badge={meta.label}
            onClick={() => openFileViewer(f.url, f.name)}
            onDelete={canDelete ? () => handleDeleteFile(f) : undefined}
            deleting={deletingId === f.id}
            thumbnail={
              meta.isYt && meta.ytId ? (
                <img
                  src={`https://img.youtube.com/vi/${meta.ytId}/hqdefault.jpg`}
                  alt=""
                  className="w-full aspect-video object-cover rounded-md"
                />
              ) : null
            }
          />
        )
      })}
    </div>
  )
}

function BackButton({ parent, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border border-border bg-surface-2 px-3 py-1.5 text-[12px] font-medium text-text hover:bg-border/30 transition-colors"
    >
      ← Back to {parent.name}
    </button>
  )
}
