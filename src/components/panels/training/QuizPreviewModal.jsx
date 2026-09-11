import { useEffect, useState } from 'react'
import OverlayShell from '../../shared/OverlayShell'
import { fetchQuizPreview } from '../../../lib/quizzes'

const TYPE_LABELS = { mcq: 'MCQ', true_false: 'True/False', descriptive: 'Descriptive' }

// Ported from old-portal/js/training.js's openQuizPreview — quiz meta +
// question-type breakdown, shown before the quiz is actually started.
export default function QuizPreviewModal({ open, quizId, onClose, onStart }) {
  const [quiz, setQuiz] = useState(null)
  const [typeCounts, setTypeCounts] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!open || !quizId) return
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets fresh each time the modal opens for a (possibly different) quiz
    setLoading(true)
    setError('')
    setQuiz(null)
    setTypeCounts(null)
    fetchQuizPreview(quizId)
      .then(({ quiz: q, questionTypes }) => {
        if (cancelled) return
        setQuiz(q)
        const counts = {}
        questionTypes.forEach((qq) => {
          const t = qq.question_type || 'mcq'
          counts[t] = (counts[t] || 0) + 1
        })
        setTypeCounts({ counts, total: questionTypes.length })
        setLoading(false)
      })
      .catch((e) => {
        if (cancelled) return
        setError(e.message)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, quizId])

  if (!open) return null

  return (
    <OverlayShell open={open} onClose={onClose} maxWidth="max-w-md">
      {loading && <div className="text-center py-10 text-text-muted text-[12.5px]">Loading…</div>}
      {!loading && error && <div className="text-center py-10 text-danger text-[12.5px]">⚠️ {error}</div>}
      {!loading && !error && quiz && (
        <>
          <div className="pr-8">
            <div className="text-[15px] font-semibold text-text">{quiz.title}</div>
            <div className="text-[11.5px] text-primary mt-1">📚 {quiz.content_nodes?.name || 'General'}</div>
          </div>
          <div className="text-[12.5px] text-text-muted mt-3 leading-relaxed">{quiz.description || 'No description provided.'}</div>

          <div className="grid grid-cols-3 gap-2.5 mt-4">
            <div className="rounded-lg bg-surface-2 border border-border px-2 py-2.5 text-center">
              <div className="text-[15px] font-bold text-text">{typeCounts?.total || '—'}</div>
              <div className="text-[10px] text-text-muted mt-0.5">Questions</div>
            </div>
            <div className="rounded-lg bg-surface-2 border border-border px-2 py-2.5 text-center">
              <div className="text-[15px] font-bold text-text">{quiz.time_limit || '—'}</div>
              <div className="text-[10px] text-text-muted mt-0.5">Minutes</div>
            </div>
            <div className="rounded-lg bg-surface-2 border border-border px-2 py-2.5 text-center">
              <div className="text-[15px] font-bold text-text">{quiz.passing_score || 60}%</div>
              <div className="text-[10px] text-text-muted mt-0.5">To Pass</div>
            </div>
          </div>

          {typeCounts?.total > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {Object.entries(typeCounts.counts).map(([t, count]) => (
                <span key={t} className="text-[10.5px] font-medium text-primary bg-primary-tint border border-primary/20 rounded-full px-2.5 py-1">
                  {TYPE_LABELS[t] || t} ✕{count}
                </span>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => onStart(quizId)}
            className="w-full mt-5 rounded-md bg-primary text-white text-[13px] font-medium py-2.5"
          >
            Start Quiz
          </button>
        </>
      )}
    </OverlayShell>
  )
}
