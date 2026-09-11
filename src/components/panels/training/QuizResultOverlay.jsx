import OverlayShell from '../../shared/OverlayShell'

// Ported from old-portal/js/training.js's showQuizResult — if the quiz has
// any descriptive questions, the score is explicitly shown as partial /
// pending MIS review rather than a pass/fail verdict.
export default function QuizResultOverlay({ result, onClose, onRetake }) {
  if (!result) return null
  const { quiz, questions, answers, score, totalMarks, attemptNumber } = result

  const mcqQs = questions.filter((q) => (q.question_type || 'mcq').toLowerCase() !== 'descriptive')
  const descQs = questions.filter((q) => (q.question_type || 'mcq').toLowerCase() === 'descriptive')
  const pct = totalMarks > 0 ? Math.round((score / totalMarks) * 100) : 0
  const passingPct = quiz.passing_score || 60
  const passingMarks = totalMarks > 0 ? Math.ceil((passingPct / 100) * totalMarks) : null
  const passed = pct >= passingPct

  let correctCount = 0
  mcqQs.forEach((q) => {
    const selId = answers[q.id]
    const correctOpt = (q.options || []).find((o) => o.is_correct)
    if (selId != null && correctOpt && selId == correctOpt.id) correctCount++
  })
  const wrongCount = mcqQs.length - correctCount

  const badge =
    descQs.length > 0
      ? { text: '⏳ Partial Score', cls: 'bg-surface-2 text-text-muted border-border' }
      : passed
        ? { text: '✅ PASSED', cls: 'bg-primary-tint text-primary border-primary/30' }
        : { text: '❌ FAILED', cls: 'bg-danger-tint text-danger border-danger/25' }

  return (
    <OverlayShell open={!!result} onClose={onClose} maxWidth="max-w-lg">
      <div className="text-center pr-8">
        <div className="text-[15px] font-semibold text-text mb-1">{descQs.length > 0 ? 'Quiz Completed' : passed ? 'Excellent! You Passed!' : 'Quiz Completed'}</div>
        <div className="text-[11.5px] text-text-muted mb-4">
          {quiz.title}
          {attemptNumber > 1 ? ` · Attempt #${attemptNumber}` : ''} ·{' '}
          {passed && !descQs.length ? '🎉 You cleared the passing score!' : `Need ${passingMarks ?? passingPct + '%'} marks to pass`}
        </div>

        <div className={`text-[34px] font-bold ${passed && !descQs.length ? 'text-primary' : descQs.length ? 'text-text-muted' : 'text-danger'}`}>
          {pct}%
        </div>
        <div className="text-[11.5px] text-text-muted mb-3">
          {score}/{totalMarks} pts{descQs.length > 0 ? ' (partial)' : ''}
        </div>

        <div className={`inline-block rounded-full px-4 py-1.5 text-[12px] font-bold border ${badge.cls}`}>{badge.text}</div>

        {descQs.length > 0 && (
          <div className="mt-3 rounded-lg border border-border bg-surface-2 px-3.5 py-2.5 text-[11.5px] text-text-muted">
            📝 {descQs.length} descriptive question{descQs.length > 1 ? 's' : ''} pending manual review by MIS.
            <br />
            Your final score will be updated after grading.
          </div>
        )}

        {mcqQs.length > 0 && (
          <div className="flex justify-center gap-4 mt-4 text-[12px] text-text-muted">
            <span>✅ {correctCount} correct</span>
            <span>❌ {wrongCount} wrong</span>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 mt-5 text-left">
        {questions.map((q, i) => (
          <AnswerReviewRow key={q.id} q={q} index={i} answer={answers[q.id]} />
        ))}
      </div>

      <div className="flex gap-2.5 mt-5">
        <button type="button" onClick={onClose} className="flex-1 rounded-md border border-border py-2.5 text-[12.5px] font-medium text-text">
          Close
        </button>
        <button
          type="button"
          onClick={onRetake}
          className="flex-1 rounded-md bg-primary text-white py-2.5 text-[12.5px] font-medium"
        >
          🔄 Retake Quiz
        </button>
      </div>
    </OverlayShell>
  )
}

function AnswerReviewRow({ q, index, answer }) {
  const qType = (q.question_type || 'mcq').toLowerCase()

  if (qType === 'descriptive') {
    const text = typeof answer === 'object' && answer?.text ? answer.text : '(not answered)'
    return (
      <div className="rounded-lg bg-surface-2 border-l-[3px] border-primary/40 px-3.5 py-3">
        <div className="text-[10px] font-semibold text-primary uppercase tracking-wide mb-1.5">✏️ Descriptive</div>
        <div className="text-[12.5px] font-medium text-text mb-1.5">
          {index + 1}. {q.question_text}
        </div>
        <div className="text-[12px] text-text-muted bg-surface rounded-md px-2.5 py-2 border border-border leading-relaxed">{text}</div>
        <div className="text-[10.5px] text-text-muted mt-1">📋 Admin will review this answer manually.</div>
      </div>
    )
  }

  const correctOpt = (q.options || []).find((o) => o.is_correct)
  const selectedOpt = (q.options || []).find((o) => o.id == answer)
  const isOk = answer != null && correctOpt && answer == correctOpt.id

  return (
    <div className={`rounded-lg bg-surface-2 border-l-[3px] px-3.5 py-3 ${isOk ? 'border-primary' : 'border-danger'}`}>
      {qType === 'true_false' && (
        <div className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-1.5">🔘 True/False</div>
      )}
      <div className="text-[12.5px] font-medium text-text mb-1.5">
        {index + 1}. {q.question_text}
      </div>
      <div className="text-[12px]">
        <span className="text-text-muted">Your answer: </span>
        <span className={isOk ? 'text-primary font-medium' : 'text-danger font-medium'}>
          {selectedOpt ? selectedOpt.option_text : '(not answered)'}
        </span>
      </div>
      {!isOk && correctOpt && (
        <div className="text-[12px] mt-0.5">
          <span className="text-text-muted">Correct: </span>
          <span className="text-primary font-medium">{correctOpt.option_text}</span>
        </div>
      )}
    </div>
  )
}
