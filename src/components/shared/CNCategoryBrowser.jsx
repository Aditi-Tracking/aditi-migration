import { useState } from 'react'
import { CN } from '../../lib/contentNodes'
import { useFileViewer } from '../../context/FileViewerContext'

// Ported from old-portal/js/shared.js's _cnRenderOverlayContent — generic
// sub-category/file drill-down browser reused by every content-nodes-backed
// overlay (HR Docs now; Marketing/Products/Sales/etc. reuse the same
// component later). Delete buttons are intentionally omitted here — that's
// part of the deferred MIS-only upload/delete subsystem.
function fileCardMeta(url) {
  const ext = (url || '').split('?')[0].split('.').pop().toLowerCase()
  const ytMatch = (url || '').match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/)
  const isYt = !!ytMatch
  const isVid = ['mp4', 'webm', 'mov'].includes(ext)
  const isPdf = ext === 'pdf'
  const label = isYt ? '▶ YouTube' : isVid ? '🎬 Video' : isPdf ? '📄 PDF' : '📁 Open'
  return { isYt, ytId: ytMatch?.[1] || null, isVid, isPdf, label }
}

export default function CNCategoryBrowser({ rootNodeId, rootName }) {
  const { openFileViewer } = useFileViewer()
  const [stack, setStack] = useState([]) // ancestors, oldest first: [{id, name}]
  const [current, setCurrent] = useState({ id: rootNodeId, name: rootName })

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
          <button
            key={sc.id}
            type="button"
            onClick={() => drillDown(sc)}
            className="col-span-full sm:col-span-1 flex items-center gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-left hover:border-primary/40 transition-colors"
          >
            <div className="w-9 h-9 rounded-md bg-primary-tint border border-primary/20 flex items-center justify-center text-primary shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[12.5px] font-medium text-text truncate">{name}</div>
              <div className="text-[11px] text-text-muted mt-0.5">
                {count} file{count === 1 ? '' : 's'}
              </div>
            </div>
            <span className="text-primary text-[13px] shrink-0">→</span>
          </button>
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
          <button
            key={f.id}
            type="button"
            onClick={() => openFileViewer(f.url, f.name)}
            className="flex flex-col items-start gap-2.5 rounded-lg border border-border bg-surface-2 px-3 py-3 text-left hover:border-primary/40 transition-colors"
          >
            {meta.isYt && meta.ytId ? (
              <img
                src={`https://img.youtube.com/vi/${meta.ytId}/hqdefault.jpg`}
                alt=""
                className="w-full aspect-video object-cover rounded-md"
              />
            ) : (
              <div className="w-9 h-9 rounded-md bg-primary-tint border border-primary/20 flex items-center justify-center text-primary">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </div>
            )}
            <div className="text-[12.5px] font-medium text-text leading-snug">{f.name}</div>
            <span className="text-[10px] font-medium text-primary bg-primary-tint border border-primary/20 rounded-full px-2 py-0.5">
              {meta.label}
            </span>
          </button>
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
