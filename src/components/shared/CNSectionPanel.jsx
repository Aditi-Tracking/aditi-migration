import { useState } from 'react'
import { CN } from '../../lib/contentNodes'
import { getCNCardDesc } from '../../lib/cnCardDescriptions'
import { clearCardName, setCardName } from '../../lib/activityTracking'
import { useAuth } from '../../context/AuthContext'
import { canUploadFiles } from '../../lib/cnUploadDelete'
import { useCNSectionLoader } from '../../hooks/useCNSectionLoader'
import OverlayShell from './OverlayShell'
import CNCategoryBrowser from './CNCategoryBrowser'
import DocCard from './DocCard'
import UploadModal from './UploadModal'
import { DOC_ICON } from './docIcons'

// Generic content-nodes section panel — ports old-portal/js/shared.js's
// cnRenderCatGrid + cnOpenOverlay (the fully generic pair Sales calls
// directly). Renders every category under `sectionName` as a card; clicking
// one opens the same CNCategoryBrowser drill-down used by HR. Reusable by
// any module whose old-portal panel is "a plain CN grid with no special
// static cards" — confirm that shape before reusing this for a new module.
//
// trackCardOpen/trackCardClose default to false and must be set explicitly
// per module — production's own card-open/close tracking is inconsistent
// per module (Sales only tracks close, most others track nothing at all),
// so this component must not track uniformly for every consumer.
// `extraCard`, when passed, renders as the FIRST grid item, ahead of every content_nodes card —
// matches production's own `gridEl.insertBefore(card, gridEl.firstChild)` pattern for a
// module-specific tool card injected onto an otherwise-generic CN grid (Finance's "Purchase
// Request" card is the first real consumer of this; Sales' still-deferred "Deal Calculator" card
// is the same shape, for whenever that's built).
export default function CNSectionPanel({ sectionName, title, breadcrumb, trackCardOpen = false, trackCardClose = false, extraCard = null }) {
  const { permissions } = useAuth()
  const canDelete = canUploadFiles(permissions)

  const { loading, error, cats, reload, deleteCard } = useCNSectionLoader(sectionName)
  const [openModule, setOpenModule] = useState(null) // { id, name } | null
  const [uploadOpen, setUploadOpen] = useState(false)

  return (
    <div className="px-4 sm:px-6 py-5">
      <div className="flex items-center justify-between gap-3 mb-1">
        <div>
          <div className="text-[16px] font-semibold text-text">{title}</div>
          <div className="text-[11.5px] text-text-muted mt-0.5">{breadcrumb}</div>
        </div>
        {canDelete && (
          <button
            type="button"
            onClick={() => setUploadOpen(true)}
            className="text-[12px] font-medium text-primary border border-primary/30 rounded-md px-3 py-1.5 shrink-0"
          >
            📤 Upload
          </button>
        )}
      </div>

      {loading && <div className="text-center py-16 text-text-muted text-[13px]">Loading…</div>}
      {!loading && error && <div className="text-center py-16 text-danger text-[13px]">⚠️ {error}</div>}

      {!loading && !error && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-5">
          {extraCard}
          {cats.map((cat) => {
            const count = CN.totalFiles(cat.id)
            return (
              <DocCard
                key={cat.id}
                icon={DOC_ICON}
                name={cat.name}
                desc={getCNCardDesc(cat.name)}
                meta={`📂 ${count} file${count === 1 ? '' : 's'}`}
                onClick={() => {
                  if (trackCardOpen) setCardName(cat.name)
                  setOpenModule({ id: cat.id, name: cat.name })
                }}
                onDelete={canDelete ? () => deleteCard(cat) : undefined}
              />
            )
          })}
        </div>
      )}

      <OverlayShell
        open={!!openModule}
        onClose={() => {
          if (trackCardClose) clearCardName()
          setOpenModule(null)
        }}
        maxWidth="max-w-5xl"
        height="h-[640px]"
      >
        {openModule && (
          <>
            <div className="flex items-center gap-3 mb-5 pr-8">
              <div className="w-10 h-10 rounded-lg bg-primary-tint border border-primary/20 flex items-center justify-center text-primary shrink-0">
                {DOC_ICON}
              </div>
              <div className="text-[15px] font-semibold text-text">{openModule.name}</div>
            </div>
            <CNCategoryBrowser rootNodeId={openModule.id} rootName={openModule.name} canDelete={canDelete} onContentChanged={reload} />
          </>
        )}
      </OverlayShell>

      <UploadModal open={uploadOpen} sectionName={sectionName} onClose={() => setUploadOpen(false)} onUploaded={reload} />
    </div>
  )
}
