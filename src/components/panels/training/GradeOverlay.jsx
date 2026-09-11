import { useEffect, useMemo, useState } from 'react'
import OverlayShell from '../../shared/OverlayShell'
import { useAuth } from '../../../context/AuthContext'
import { fetchAllAttemptsForGrading, fetchAttemptAnswersForGrading, saveDescriptiveMark } from '../../../lib/quizAdmin'

function hasDescriptive(questionsByQuiz, quizId) {
  return (questionsByQuiz[quizId] || []).some((q) => (q.question_type || '').toLowerCase() === 'descriptive')
}

// Ported from old-portal/js/training.js's openGradeOverlay/goLoadAll/
// goLoadAllAnswers/goSaveMark. Independently reachable from TrainingPanel
// (not nested inside QuizAdminOverlay), matching production. Saving one
// descriptive mark updates just that attempt's row in place rather than
// re-fetching the whole list, to avoid losing scroll position — same
// intent as goUpdateRowDisplay.
export default function GradeOverlay({ open, onClose }) {
  const { permissions } = useAuth()
  const canGrade = permissions.can_upload_quiz === 'true'

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [quizzes, setQuizzes] = useState([])
  const [attempts, setAttempts] = useState([])
  const [questionsByQuiz, setQuestionsByQuiz] = useState({})
  const [gradedMap, setGradedMap] = useState({})

  const [quizFilter, setQuizFilter] = useState('')
  const [nameFilter, setNameFilter] = useState('')
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => {
    if (!open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-time fetch each time the overlay opens
    setLoading(true)
    setError('')
    setExpandedId(null)
    fetchAllAttemptsForGrading()
      .then(({ quizzes, attempts, questionsByQuiz, gradedMap }) => {
        setQuizzes(quizzes)
        setAttempts(attempts)
        setQuestionsByQuiz(questionsByQuiz)
        setGradedMap(gradedMap)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [open])

  const quizTitleById = useMemo(() => {
    const m = {}
    quizzes.forEach((q) => (m[q.id] = q.title))
    return m
  }, [quizzes])

  const filtered = useMemo(() => {
    return attempts.filter((a) => {
      if (quizFilter && String(a.quiz_id) !== String(quizFilter)) return false
      if (nameFilter) {
        const name = (a.Employee_details?.Employee_name || '').toLowerCase()
        if (!name.includes(nameFilter.toLowerCase())) return false
      }
      return true
    })
  }, [attempts, quizFilter, nameFilter])

  function statusFor(attempt) {
    if (!hasDescriptive(questionsByQuiz, attempt.quiz_id)) return null
    if (!(attempt.id in gradedMap)) return null
    return gradedMap[attempt.id] ? 'graded' : 'pending'
  }

  function patchAttempt(attemptId, fields) {
    setAttempts((prev) => prev.map((a) => (a.id === attemptId ? { ...a, ...fields } : a)))
  }

  if (!open) return null

  return (
    <OverlayShell open={open} onClose={onClose} maxWidth="max-w-3xl">
      <div className="text-[15px] font-semibold text-text mb-3 pr-8">Grade Descriptive Answers</div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-4">
        <select
          value={quizFilter}
          onChange={(e) => setQuizFilter(e.target.value)}
          className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[12.5px] text-text outline-none"
        >
          <option value="">All Quizzes</option>
          {quizzes.map((q) => (
            <option key={q.id} value={q.id}>
              {q.title}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={nameFilter}
          onChange={(e) => setNameFilter(e.target.value)}
          placeholder="Filter by employee name…"
          className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[12.5px] text-text outline-none"
        />
      </div>

      {loading && <div className="text-center py-10 text-text-muted text-[12.5px]">Loading attempts…</div>}
      {!loading && error && <div className="text-center py-10 text-danger text-[12.5px]">⚠️ {error}</div>}
      {!loading && !error && !filtered.length && (
        <div className="text-center py-10 text-text-muted text-[12.5px]">No attempts match.</div>
      )}

      {!loading && !error && (
        <div className="flex flex-col gap-2.5 max-h-[60vh] overflow-y-auto">
          {filtered.map((a) => {
            const status = statusFor(a)
            const isOpen = expandedId === a.id
            return (
              <div key={a.id} className="rounded-lg border border-border bg-surface-2">
                <button
                  type="button"
                  onClick={() => setExpandedId(isOpen ? null : a.id)}
                  className="w-full flex items-center gap-3 flex-wrap px-3.5 py-3 text-left"
                >
                  <div className="flex-1 min-w-[160px]">
                    <div className="text-[12.5px] font-semibold text-text">{a.Employee_details?.Employee_name || 'Unknown'}</div>
                    <div className="text-[10.5px] text-text-muted mt-0.5">
                      {quizTitleById[a.quiz_id] || '—'} · Attempt #{a.attempt_number} · {a.Employee_details?.Employee_Dept || '—'}
                    </div>
                  </div>
                  <div className="text-[11.5px] font-semibold text-text">
                    {a.score != null ? `${a.score}/${a.total_marks}` : '—'}
                  </div>
                  {status === 'pending' && (
                    <span className="text-[10.5px] font-medium text-danger bg-danger-tint border border-danger/20 rounded-full px-2 py-0.5">
                      ⏳ Grading Pending
                    </span>
                  )}
                  {status === 'graded' && (
                    <span className="text-[10.5px] font-medium text-primary bg-primary-tint border border-primary/20 rounded-full px-2 py-0.5">
                      ✅ Graded
                    </span>
                  )}
                  <span className="text-text-muted text-[12px] shrink-0">{isOpen ? '▲' : '▼'}</span>
                </button>
                {isOpen && (
                  <AttemptDetail
                    attempt={a}
                    canGrade={canGrade}
                    onScoreSaved={(newScore, fullyGraded) => {
                      patchAttempt(a.id, { score: newScore })
                      setGradedMap((prev) => ({ ...prev, [a.id]: fullyGraded }))
                    }}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}
    </OverlayShell>
  )
}

function AttemptDetail({ attempt, canGrade, onScoreSaved }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [answers, setAnswers] = useState([])
  const [optionsByQuestion, setOptionsByQuestion] = useState({})
  const [drafts, setDrafts] = useState({})
  const [savingId, setSavingId] = useState(null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-time fetch when a row is expanded
    setLoading(true)
    setError('')
    fetchAttemptAnswersForGrading(attempt.id)
      .then(({ answers, optionsByQuestion }) => {
        setAnswers(answers)
        setOptionsByQuestion(optionsByQuestion)
        const d = {}
        answers.forEach((a) => {
          if ((a.questions?.question_type || '').toLowerCase() === 'descriptive') {
            d[a.id] = a.marks_awarded != null ? a.marks_awarded : ''
          }
        })
        setDrafts(d)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [attempt.id])

  async function handleSaveMark(answerId, maxMark) {
    if (!canGrade) {
      alert('⛔ Only MIS members can grade.')
      return
    }
    const raw = drafts[answerId]
    const marks = parseFloat(raw)
    if (isNaN(marks) || marks < 0) {
      alert('Please enter a valid mark.')
      return
    }
    if (maxMark > 0 && marks > maxMark) {
      alert(`⚠️ Marks cannot exceed ${maxMark} for this question.`)
      setDrafts((prev) => ({ ...prev, [answerId]: maxMark }))
      return
    }
    setSavingId(answerId)
    try {
      const { newScore, fullyGraded } = await saveDescriptiveMark({ answerId, attemptId: attempt.id, marks })
      setAnswers((prev) => prev.map((a) => (a.id === answerId ? { ...a, marks_awarded: marks } : a)))
      onScoreSaved(newScore, fullyGraded)
    } catch (e) {
      alert('Save error: ' + e.message)
    } finally {
      setSavingId(null)
    }
  }

  if (loading) return <div className="px-3.5 pb-3.5 text-[12px] text-text-muted">Loading answers…</div>
  if (error) return <div className="px-3.5 pb-3.5 text-[12px] text-danger">⚠️ {error}</div>

  return (
    <div className="px-3.5 pb-3.5 flex flex-col gap-2.5 border-t border-border pt-3">
      {answers.map((a) => {
        const qType = (a.questions?.question_type || 'mcq').toLowerCase()
        const opts = optionsByQuestion[a.questions?.id] || []
        return (
          <div key={a.id} className="rounded-md bg-surface border border-border px-3 py-2.5">
            <div className="text-[12px] font-medium text-text mb-1.5">{a.questions?.question_text}</div>

            {qType !== 'descriptive' && (
              <div className="flex flex-col gap-1">
                {opts.map((o) => {
                  const isSelected = o.id === a.selected_option_id
                  const isCorrect = o.is_correct
                  return (
                    <div
                      key={o.id}
                      className={`text-[11.5px] rounded px-2 py-1 ${
                        isSelected && isCorrect
                          ? 'bg-primary-tint text-primary font-medium'
                          : isSelected && !isCorrect
                            ? 'bg-danger-tint text-danger font-medium'
                            : isCorrect
                              ? 'text-primary'
                              : 'text-text-muted'
                      }`}
                    >
                      {isSelected ? '● ' : '○ '}
                      {o.option_text}
                      {isCorrect ? ' (correct)' : ''}
                    </div>
                  )
                })}
              </div>
            )}

            {qType === 'descriptive' && (
              <div>
                <div className="text-[11.5px] text-text bg-primary-tint border border-primary/20 rounded px-2.5 py-2 mb-2 whitespace-pre-wrap">
                  {a.answer_text || <span className="text-text-muted italic">No answer submitted</span>}
                </div>
                {a.questions?.correct_answer_text && (
                  <div className="text-[10.5px] text-text-muted mb-2">
                    Model answer: <span className="italic">{a.questions.correct_answer_text}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <span className="text-[10.5px] font-medium text-text-muted">Marks (of {a.questions?.marks || 1}):</span>
                  <input
                    type="number"
                    min={0}
                    max={a.questions?.marks || 1}
                    value={drafts[a.id] ?? ''}
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [a.id]: e.target.value }))}
                    className="w-20 rounded-md border border-border bg-surface-2 px-2 py-1 text-[12px] text-text outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => handleSaveMark(a.id, a.questions?.marks || 1)}
                    disabled={savingId === a.id}
                    className="text-[11px] font-medium text-white bg-primary rounded-md px-2.5 py-1 disabled:opacity-60"
                  >
                    {savingId === a.id ? 'Saving…' : a.marks_awarded != null ? 'Update' : 'Save'}
                  </button>
                  {a.marks_awarded != null && <span className="text-[10.5px] text-primary">✓ Graded</span>}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
