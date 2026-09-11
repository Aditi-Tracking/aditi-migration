import { useCallback, useEffect, useRef, useState } from 'react'
import OverlayShell from '../../shared/OverlayShell'
import { useAuth } from '../../../context/AuthContext'
import { fetchEmployeeId } from '../../../lib/employeeProfile'
import { countPriorAttempts, createQuizAttempt, fetchQuizWithQuestions, patchAttemptScore, submitQuizAnswers } from '../../../lib/quizzes'

function isAnswered(v) {
  if (v === undefined || v === null) return false
  if (typeof v === 'object') return !!(v.text && v.text.length > 0)
  return true
}

function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0')
  const s = (totalSeconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

// Ported from old-portal/js/training.js's startDBQuiz/renderQuizQuestion/
// qtNavigate/submitDBQuiz — a single whole-quiz countdown timer (not
// per-question), one question shown at a time, auto-submit on expiry.
// Scoring is 100% client-side (MCQ/True-False auto-scored, descriptive = 0
// until MIS grades it later) with no server-side recompute — exactly as
// old-portal does it.
export default function QuizTakingOverlay({ open, quizId, onClose, onFinished }) {
  const { currentUser } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [quiz, setQuiz] = useState(null)
  const [questions, setQuestions] = useState([])
  const [attemptId, setAttemptId] = useState(null)
  const [attemptNumber, setAttemptNumber] = useState(1)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState({})
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const timerRef = useRef(null)
  const submitRef = useRef(null)

  useEffect(() => {
    if (!open || !quizId) return
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets fresh each time the overlay opens for a (possibly different) quiz
    setLoading(true)
    setError('')
    setQuiz(null)
    setQuestions([])
    setCurrentIndex(0)
    setAnswers({})
    setAttemptId(null)
    setSubmitting(false)

    async function setup() {
      try {
        const { quiz: q, questions: qs } = await fetchQuizWithQuestions(quizId)
        if (cancelled) return

        let empId = null
        if (currentUser?.email) empId = await fetchEmployeeId(currentUser.email)
        if (cancelled) return

        const priorCount = await countPriorAttempts(quizId, empId)
        const attemptNum = priorCount + 1
        const newAttemptId = await createQuizAttempt({ quizId, attemptNumber: attemptNum, empId })
        if (cancelled) return

        setQuiz(q)
        setQuestions(qs)
        setAttemptId(newAttemptId)
        setAttemptNumber(attemptNum)
        setSecondsLeft((q.time_limit || 15) * 60)
        setLoading(false)
      } catch (e) {
        if (cancelled) return
        setError(e.message)
        setLoading(false)
      }
    }
    setup()
    return () => {
      cancelled = true
    }
  }, [open, quizId, currentUser])

  const handleSubmit = useCallback(
    async (auto = false) => {
      if (!questions.length || !attemptId) return
      if (!auto) {
        const answeredCount = questions.filter((q) => isAnswered(answers[q.id])).length
        const unanswered = questions.length - answeredCount
        if (unanswered > 0 && !confirm(`${unanswered} question(s) unanswered. Submit anyway?`)) return
      }

      setSubmitting(true)
      clearInterval(timerRef.current)
      try {
        const mcqRows = []
        const descRows = []
        questions.forEach((q) => {
          const qType = (q.question_type || 'mcq').toLowerCase()
          const val = answers[q.id]
          if (qType === 'descriptive') {
            const text = typeof val === 'object' && val?.text ? val.text.trim() : null
            descRows.push({ attempt_id: attemptId, question_id: q.id, answer_text: text })
          } else {
            const selId = val !== null && val !== undefined && typeof val !== 'object' ? parseInt(val, 10) : null
            mcqRows.push({ attempt_id: attemptId, question_id: q.id, selected_option_id: selId })
          }
        })

        await submitQuizAnswers({ mcqRows, descRows })

        let score = 0
        let totalMarks = 0
        questions.forEach((q) => {
          const qType = (q.question_type || 'mcq').toLowerCase()
          const marks = q.marks || 1
          totalMarks += marks
          if (qType === 'descriptive') return
          const selId = answers[q.id]
          const correctOpt = (q.options || []).find((o) => o.is_correct)
          if (selId != null && correctOpt && parseInt(selId, 10) === correctOpt.id) score += marks
        })

        await patchAttemptScore(attemptId, { score, totalMarks })

        onFinished({ quiz, questions, answers, score, totalMarks, attemptNumber, attemptId })
      } catch (e) {
        alert('⚠️ Error submitting quiz:\n' + e.message)
        setSubmitting(false)
      }
    },
    [questions, attemptId, answers, quiz, attemptNumber, onFinished]
  )

  useEffect(() => {
    submitRef.current = handleSubmit
  }, [handleSubmit])

  useEffect(() => {
    if (loading || error || !attemptId) return
    timerRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(timerRef.current)
          submitRef.current(true)
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(timerRef.current)
  }, [loading, error, attemptId])

  function confirmQuit() {
    if (confirm('Are you sure you want to quit this quiz? Your progress will be lost.')) {
      clearInterval(timerRef.current)
      onClose()
    }
  }

  function setMcqAnswer(questionId, optionId) {
    setAnswers((prev) => ({ ...prev, [questionId]: optionId }))
  }

  function setDescriptiveAnswer(questionId, text) {
    setAnswers((prev) => ({ ...prev, [questionId]: { text } }))
  }

  if (!open) return null

  const answeredCount = questions.filter((q) => isAnswered(answers[q.id])).length
  const q = questions[currentIndex]
  const pct = questions.length ? Math.round(((currentIndex + 1) / questions.length) * 100) : 0

  return (
    <OverlayShell open={open} onClose={confirmQuit} maxWidth="max-w-2xl">
      {loading && <div className="text-center py-12 text-text-muted text-[12.5px]">Loading quiz…</div>}
      {!loading && error && (
        <div className="text-center py-12">
          <div className="text-danger text-[13px] mb-4">⚠️ {error}</div>
          <button type="button" onClick={onClose} className="rounded-md border border-border px-4 py-2 text-[12.5px] text-text">
            ← Close
          </button>
        </div>
      )}
      {!loading && !error && q && (
        <div>
          <div className="flex items-start justify-between gap-3 mb-1 pr-8">
            <div>
              <div className="text-[14.5px] font-semibold text-text">{quiz.title}</div>
              <div className="text-[11px] text-text-muted mt-0.5">
                {questions.length} questions · Pass: {quiz.passing_score || 60}%
                {attemptNumber > 1 ? ` · Attempt #${attemptNumber}` : ''}
              </div>
            </div>
            <div className={`text-[15px] font-bold shrink-0 ${secondsLeft <= 60 ? 'text-danger' : 'text-primary'}`}>
              {formatTime(secondsLeft)}
            </div>
          </div>

          <div className="h-1.5 rounded-full bg-surface-2 mt-3 mb-4 overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: pct + '%' }} />
          </div>

          <div className="text-[11px] font-medium text-text-muted mb-1.5">Question {currentIndex + 1}</div>
          <div className="text-[13.5px] font-medium text-text mb-4">{q.question_text}</div>

          <QuestionInput
            question={q}
            value={answers[q.id]}
            onSelect={(optId) => setMcqAnswer(q.id, optId)}
            onChangeText={(text) => setDescriptiveAnswer(q.id, text)}
          />

          <div className="flex items-center justify-between mt-6 pt-4 border-t border-border">
            <button
              type="button"
              disabled={currentIndex === 0}
              onClick={() => setCurrentIndex((i) => i - 1)}
              className="rounded-md border border-border px-3.5 py-2 text-[12.5px] text-text disabled:opacity-30"
            >
              ← Prev
            </button>
            <div className="text-[11px] text-text-muted">{answeredCount}/{questions.length} answered</div>
            {currentIndex < questions.length - 1 ? (
              <button
                type="button"
                onClick={() => setCurrentIndex((i) => i + 1)}
                className="rounded-md bg-primary text-white px-3.5 py-2 text-[12.5px] font-medium"
              >
                Next →
              </button>
            ) : (
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleSubmit(false)}
                className="rounded-md bg-primary text-white px-4 py-2 text-[12.5px] font-medium disabled:opacity-60"
              >
                {submitting ? 'Submitting…' : '✅ Submit Quiz'}
              </button>
            )}
          </div>
        </div>
      )}
    </OverlayShell>
  )
}

function QuestionInput({ question, value, onSelect, onChangeText }) {
  const qType = question.question_type || 'mcq'

  if (qType === 'true_false') {
    const opts = question.options || []
    const trueOpt = opts.find((o) => o.option_text === 'True' || o.option_text === 'true')
    const falseOpt = opts.find((o) => o.option_text === 'False' || o.option_text === 'false')
    return (
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => onSelect(trueOpt?.id)}
          className={`flex-1 rounded-lg py-5 text-[15px] font-bold border-2 transition-colors ${
            value == trueOpt?.id ? 'border-primary bg-primary-tint text-primary' : 'border-border bg-surface-2 text-text-muted'
          }`}
        >
          ✅ TRUE
        </button>
        <button
          type="button"
          onClick={() => onSelect(falseOpt?.id)}
          className={`flex-1 rounded-lg py-5 text-[15px] font-bold border-2 transition-colors ${
            value == falseOpt?.id ? 'border-danger bg-danger-tint text-danger' : 'border-border bg-surface-2 text-text-muted'
          }`}
        >
          ❌ FALSE
        </button>
      </div>
    )
  }

  if (qType === 'descriptive') {
    return (
      <div className="rounded-lg border border-primary/25 bg-primary-tint p-3.5">
        <div className="text-[10.5px] font-semibold text-primary uppercase tracking-wide mb-2">✏️ Write Your Answer</div>
        <textarea
          rows={5}
          value={value?.text || ''}
          onChange={(e) => onChangeText(e.target.value)}
          placeholder="Type your answer here…"
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-[12.5px] text-text outline-none resize-y"
        />
        <div className="text-[10.5px] text-text-muted mt-1.5">Write a detailed answer. It will be reviewed by the admin.</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {(question.options || []).map((opt) => {
        const isSelected = value == opt.id
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onSelect(opt.id)}
            className={`flex items-center gap-3 rounded-lg border-2 px-4 py-3 text-left transition-colors ${
              isSelected ? 'border-primary bg-primary-tint' : 'border-border bg-surface-2'
            }`}
          >
            <span
              className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                isSelected ? 'border-primary bg-primary' : 'border-border'
              }`}
            >
              {isSelected && (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </span>
            <span className="text-[12.5px] text-text">{opt.option_text}</span>
          </button>
        )
      })}
    </div>
  )
}
