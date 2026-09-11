import { useEffect, useState } from 'react'
import OverlayShell from '../../shared/OverlayShell'
import CNCategoryBrowser from '../../shared/CNCategoryBrowser'
import { fetchQuizzesForNode } from '../../../lib/quizzes'

// Ported from old-portal's shared marketingOverlay + switchMktTab/
// _showAssessmentTab — Training is the only module that actually shows
// this tab bar (Marketing/Products/IT Admin hide it). Videos tab reuses
// CNCategoryBrowser unchanged; Assessment tab is Training-specific.
export default function TrainingModuleOverlay({ open, node, onClose, onSelectQuiz }) {
  const [tab, setTab] = useState('videos')

  useEffect(() => {
    // Reset to the Videos tab each time the overlay opens — it stays mounted between opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) setTab('videos')
  }, [open])

  if (!open || !node) return null

  return (
    <OverlayShell open={open} onClose={onClose} maxWidth="max-w-3xl">
      <div className="text-[15px] font-semibold text-text mb-3 pr-8">{node.name}</div>

      <div className="flex gap-1.5 border-b border-border mb-4">
        <button
          type="button"
          onClick={() => setTab('videos')}
          className={`px-3.5 py-2 text-[12.5px] font-medium border-b-2 -mb-px ${
            tab === 'videos' ? 'border-primary text-primary' : 'border-transparent text-text-muted'
          }`}
        >
          🎬 Training Videos
        </button>
        <button
          type="button"
          onClick={() => setTab('assessment')}
          className={`px-3.5 py-2 text-[12.5px] font-medium border-b-2 -mb-px ${
            tab === 'assessment' ? 'border-primary text-primary' : 'border-transparent text-text-muted'
          }`}
        >
          📝 Assessment
        </button>
      </div>

      {tab === 'videos' ? (
        <CNCategoryBrowser rootNodeId={node.id} rootName={node.name} />
      ) : (
        <QuizList nodeId={node.id} onSelectQuiz={onSelectQuiz} />
      )}
    </OverlayShell>
  )
}

function QuizList({ nodeId, onSelectQuiz }) {
  const [quizzes, setQuizzes] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-time fetch, refires if nodeId changes
    setLoading(true)
    fetchQuizzesForNode(nodeId).then((data) => {
      if (cancelled) return
      setQuizzes(data)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [nodeId])

  if (loading) return <div className="text-center py-10 text-text-muted text-[12.5px]">Loading quizzes…</div>
  if (!quizzes.length) {
    return <div className="text-center py-10 text-text-muted text-[12.5px]">No quizzes available for this module yet.</div>
  }

  return (
    <div className="flex flex-col gap-2.5">
      {quizzes.map((q) => {
        const totalMarks = (q.questions || []).reduce((s, qq) => s + (qq.marks || 1), 0)
        const passingPct = q.passing_score || 60
        const passingMks = totalMarks > 0 ? Math.ceil((passingPct / 100) * totalMarks) : null
        const passLabel = passingMks ? `🎯 Pass: ${passingMks}/${totalMarks} marks` : `🎯 Pass: ${passingPct}%`
        const mod = q.content_nodes?.name || 'General'
        return (
          <button
            key={q.id}
            type="button"
            onClick={() => onSelectQuiz(q.id)}
            className="flex items-center gap-3 rounded-lg border border-border bg-surface-2 px-3.5 py-3 text-left hover:border-primary/40 transition-colors"
          >
            <div className="w-9 h-9 rounded-md bg-primary-tint border border-primary/20 flex items-center justify-center text-primary shrink-0">📝</div>
            <div className="flex-1 min-w-0">
              <div className="text-[12.5px] font-medium text-text truncate">{q.title}</div>
              <div className="text-[10.5px] text-text-muted mt-0.5">
                {[mod, q.time_limit ? `⏱ ${q.time_limit} min` : '', passLabel].filter(Boolean).join(' · ')}
              </div>
            </div>
            <span className="text-primary text-[13px] shrink-0">→</span>
          </button>
        )
      })}
    </div>
  )
}
