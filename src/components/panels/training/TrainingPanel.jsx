import { useState } from 'react'
import { CN } from '../../../lib/contentNodes'
import { getCNCardDesc } from '../../../lib/cnCardDescriptions'
import { useAuth } from '../../../context/AuthContext'
import { logActivity } from '../../../lib/activityTracking'
import { canUploadFiles } from '../../../lib/cnUploadDelete'
import { useCNSectionLoader } from '../../../hooks/useCNSectionLoader'
import DocCard from '../../shared/DocCard'
import UploadModal from '../../shared/UploadModal'
import { DOC_ICON } from '../../shared/docIcons'
import TrainingModuleOverlay from './TrainingModuleOverlay'

// Ported from old-portal/js/training.js's loadTrainingSection() (plain
// content_nodes grid). Videos-only — the Assessment/Quiz subsystem (quiz
// creation, taking, grading, results) was deliberately removed as a
// product decision, not a port gap; see MIGRATION-NOTES.md.
export default function TrainingPanel() {
  const { currentUser, permissions } = useAuth()
  const canDelete = canUploadFiles(permissions)

  const { loading, error, cats, reload, deleteCard } = useCNSectionLoader('Training')

  const [moduleNode, setModuleNode] = useState(null) // { id, name } | null
  const [uploadOpen, setUploadOpen] = useState(false)

  return (
    <div className="px-4 sm:px-6 py-5">
      <div className="flex items-center justify-between gap-3 mb-1">
        <div>
          <div className="text-[18px] font-bold text-text">Training</div>
          <div className="text-[13.5px] text-text-muted mt-0.5">Home › Training</div>
        </div>
        <div className="flex items-center gap-2">
          {canDelete && (
            <button
              type="button"
              onClick={() => setUploadOpen(true)}
              className="text-[14px] font-semibold text-primary border border-primary/30 rounded-md px-3 py-1.5"
            >
              📤 Upload
            </button>
          )}
        </div>
      </div>

      {loading && <div className="text-center py-16 text-text-muted text-[15px]">Loading…</div>}
      {!loading && error && <div className="text-center py-16 text-danger text-[15px]">⚠️ {error}</div>}

      {!loading && !error && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-5">
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
                  // Matches training.js's cnOpenTrainingOverlay — logs directly, no
                  // ambient card_name and no corresponding close event in production.
                  logActivity(currentUser, {
                    event_type: 'training_module_open',
                    event_detail: `Opened training card: ${cat.name}`,
                    card_name: cat.name,
                  })
                  setModuleNode({ id: cat.id, name: cat.name })
                }}
                onDelete={canDelete ? () => deleteCard(cat) : undefined}
              />
            )
          })}
        </div>
      )}

      <TrainingModuleOverlay
        open={!!moduleNode}
        node={moduleNode}
        canDelete={canDelete}
        onContentChanged={reload}
        onClose={() => setModuleNode(null)}
      />

      <UploadModal open={uploadOpen} sectionName="Training" onClose={() => setUploadOpen(false)} onUploaded={reload} />
    </div>
  )
}
