import { useEffect, useState } from 'react'
import OverlayShell from '../../shared/OverlayShell'
import CNCategoryBrowser from '../../shared/CNCategoryBrowser'
import UploadModal from '../../shared/UploadModal'
import { CN } from '../../../lib/contentNodes'

// Ported from old-portal/js/hr.js's openHRDocsOverlay — resolves the CN
// node for SOP/HR Policy/Mediclaim/new-category by name, searching direct
// children of the HR section, then one level deeper as a fallback.
function resolveHRDocNode(hrSectionId, moduleName) {
  const cats = CN.getCategories(hrSectionId)
  let node = cats.find((c) => (c.name || '').trim().toLowerCase() === moduleName.trim().toLowerCase())
  if (!node) {
    for (const cat of cats) {
      const sub = CN.getCategories(cat.id).find(
        (s) => (s.name || '').trim().toLowerCase() === moduleName.trim().toLowerCase()
      )
      if (sub) {
        node = sub
        break
      }
    }
  }
  return node
}

export default function HRDocsOverlay({ open, module, hrSectionId, canDelete, onContentChanged, onClose }) {
  const [node, setNode] = useState(null)
  const [resolved, setResolved] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)

  useEffect(() => {
    if (!open || !module || !hrSectionId) return
    // Resolve the node fresh each time the overlay opens for a (possibly
    // different) module — the overlay stays mounted between opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNode(resolveHRDocNode(hrSectionId, module) || null)
    setResolved(true)
  }, [open, module, hrSectionId])

  if (!open) return null

  return (
    <OverlayShell open={open} onClose={onClose} maxWidth="max-w-5xl" height="h-[640px]">
      <div className="flex items-center gap-3 mb-5 pr-8">
        <div className="w-10 h-10 rounded-lg bg-primary-tint border border-primary/20 flex items-center justify-center text-primary shrink-0">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
        </div>
        <div className="text-[15px] font-semibold text-text">{module}</div>
      </div>

      {/* Upload section — Mediclaim only. old-portal's handleMediclaimFileSelected was dead code
          (never wired to a real click) and diverged from the universal upload subsystem on
          several real points (its own Documents bucket + flat storage path, no file_type on
          insert, no permission gate at all). Approved decision: use the universal subsystem as-is
          rather than port that bespoke, untested code — so this button is now gated by
          can_upload_files (via the same `canDelete` flag already threaded in) and opens the same
          UploadModal every other module uses, scoped to the HR section. */}
      {module === 'Mediclaim' && canDelete && (
        <div className="mb-4 rounded-lg border border-dashed border-border bg-surface-2 px-3.5 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-[12px] text-text-muted">📤 HR can upload new documents here</div>
          <button
            type="button"
            onClick={() => setUploadOpen(true)}
            className="rounded-md bg-danger text-white text-[12px] font-medium px-3.5 py-1.5"
          >
            Upload File
          </button>
        </div>
      )}

      {!resolved ? (
        <div className="text-center py-10 text-text-muted text-[12.5px]">Loading…</div>
      ) : node ? (
        <CNCategoryBrowser rootNodeId={node.id} rootName={module} canDelete={canDelete} onContentChanged={onContentChanged} />
      ) : (
        <div className="text-center py-10 text-text-muted text-[12.5px]">No documents found.</div>
      )}

      {module === 'Mediclaim' && (
        <UploadModal open={uploadOpen} sectionName="HR" onClose={() => setUploadOpen(false)} onUploaded={onContentChanged} />
      )}
    </OverlayShell>
  )
}
