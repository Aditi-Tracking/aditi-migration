import { useEffect, useState } from 'react'
import { CN } from '../../../lib/contentNodes'
import { getCNCardDesc } from '../../../lib/cnCardDescriptions'
import { useAuth } from '../../../context/AuthContext'
import { logActivity } from '../../../lib/activityTracking'
import { canUploadFiles, deleteContentNodeCard, invalidateContentNodes } from '../../../lib/cnUploadDelete'
import DocCard from '../../shared/DocCard'
import UploadModal from '../../shared/UploadModal'
import { DOC_ICON } from '../../shared/docIcons'
import TrainingModuleOverlay from './TrainingModuleOverlay'
import QuizPreviewModal from './QuizPreviewModal'
import QuizTakingOverlay from './QuizTakingOverlay'
import QuizResultOverlay from './QuizResultOverlay'
import MyResultsOverlay from './MyResultsOverlay'
import QuizAdminOverlay from './QuizAdminOverlay'
import GradeOverlay from './GradeOverlay'

// Ported from old-portal/js/training.js's loadTrainingSection() (plain
// content_nodes grid) plus the quiz flow entry points. Restructured away
// from Phase 1's thin CNSectionPanel wrapper because Training's overlay
// needs its own Videos/Assessment tab bar (see TrainingModuleOverlay) —
// the Videos tab behavior itself is unchanged.
//
// Quiz flow: selecting a quiz inside the module overlay closes that
// overlay and opens Preview -> Take Quiz -> Result, mirroring
// openQuizPreviewFromOverlay's closeMarketingOverlay()-then-open sequence.
export default function TrainingPanel() {
  const { currentUser, permissions } = useAuth()
  const canManageQuizzes = permissions.can_upload_quiz === 'true'
  const canDelete = canUploadFiles(permissions)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [cats, setCats] = useState([])

  const [moduleNode, setModuleNode] = useState(null) // { id, name } | null
  const [quizFlow, setQuizFlow] = useState(null) // { screen: 'preview'|'taking'|'result', quizId, result } | null
  const [myResultsOpen, setMyResultsOpen] = useState(false)
  const [quizAdminOpen, setQuizAdminOpen] = useState(false)
  const [gradeOpen, setGradeOpen] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)

  function loadCats() {
    return CN.load().then(() => {
      const section = CN.getSection('Training')
      if (!section) {
        setError('Training section not found in content_nodes')
        setLoading(false)
        return
      }
      setCats(CN.getCategories(section.id))
      setLoading(false)
    })
  }

  useEffect(() => {
    let cancelled = false
    loadCats().catch((e) => {
      if (cancelled) return
      setError(e.message)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Re-fetches Training's Videos-tab cards after an upload/delete anywhere in this panel.
  function handleContentChanged() {
    loadCats()
  }

  async function handleDeleteCard(cat) {
    if (!confirm(`⚠️ "${cat.name}" and all its files will be permanently deleted.\nAre you sure?`)) return
    try {
      await deleteContentNodeCard(cat.id)
      await invalidateContentNodes()
      handleContentChanged()
    } catch (e) {
      alert('❌ ' + e.message)
    }
  }

  function handleSelectQuiz(quizId) {
    setModuleNode(null)
    setQuizFlow({ screen: 'preview', quizId })
  }

  return (
    <div className="px-4 sm:px-6 py-5">
      <div className="flex items-center justify-between gap-3 mb-1">
        <div>
          <div className="text-[16px] font-semibold text-text">Training</div>
          <div className="text-[11.5px] text-text-muted mt-0.5">Home › Training</div>
        </div>
        <div className="flex items-center gap-2">
          {canManageQuizzes && (
            <button
              type="button"
              onClick={() => setQuizAdminOpen(true)}
              className="text-[12px] font-medium text-primary border border-primary/30 rounded-md px-3 py-1.5"
            >
              ➕ Create Quiz
            </button>
          )}
          {canManageQuizzes && (
            <button
              type="button"
              onClick={() => setGradeOpen(true)}
              className="text-[12px] font-medium text-primary border border-primary/30 rounded-md px-3 py-1.5"
            >
              ✏️ Grade
            </button>
          )}
          <button
            type="button"
            onClick={() => setMyResultsOpen(true)}
            className="text-[12px] font-medium text-primary border border-primary/30 rounded-md px-3 py-1.5"
          >
            📊 My Results
          </button>
          {canDelete && (
            <button
              type="button"
              onClick={() => setUploadOpen(true)}
              className="text-[12px] font-medium text-primary border border-primary/30 rounded-md px-3 py-1.5"
            >
              📤 Upload
            </button>
          )}
        </div>
      </div>

      {loading && <div className="text-center py-16 text-text-muted text-[13px]">Loading…</div>}
      {!loading && error && <div className="text-center py-16 text-danger text-[13px]">⚠️ {error}</div>}

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
                onDelete={canDelete ? () => handleDeleteCard(cat) : undefined}
              />
            )
          })}
        </div>
      )}

      <TrainingModuleOverlay
        open={!!moduleNode}
        node={moduleNode}
        canDelete={canDelete}
        onContentChanged={handleContentChanged}
        onClose={() => setModuleNode(null)}
        onSelectQuiz={handleSelectQuiz}
      />

      <UploadModal open={uploadOpen} sectionName="Training" onClose={() => setUploadOpen(false)} onUploaded={handleContentChanged} />

      <QuizPreviewModal
        open={quizFlow?.screen === 'preview'}
        quizId={quizFlow?.quizId}
        onClose={() => setQuizFlow(null)}
        onStart={(quizId) => setQuizFlow({ screen: 'taking', quizId })}
      />

      <QuizTakingOverlay
        open={quizFlow?.screen === 'taking'}
        quizId={quizFlow?.quizId}
        onClose={() => setQuizFlow(null)}
        onFinished={(result) => setQuizFlow({ screen: 'result', quizId: quizFlow.quizId, result })}
      />

      <QuizResultOverlay
        result={quizFlow?.screen === 'result' ? quizFlow.result : null}
        onClose={() => setQuizFlow(null)}
        onRetake={() => setQuizFlow({ screen: 'taking', quizId: quizFlow.quizId })}
      />

      <MyResultsOverlay open={myResultsOpen} onClose={() => setMyResultsOpen(false)} />

      {canManageQuizzes && <QuizAdminOverlay open={quizAdminOpen} onClose={() => setQuizAdminOpen(false)} />}
      {canManageQuizzes && <GradeOverlay open={gradeOpen} onClose={() => setGradeOpen(false)} />}
    </div>
  )
}
