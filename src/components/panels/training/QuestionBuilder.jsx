// Ported from old-portal/js/training.js's renderAdminQuestions — one
// question's editor within the quiz create/edit form. Marks are never
// reset on a type change, matching the original's explicit comment.
const TYPE_OPTIONS = [
  { key: 'mcq', label: '☑ MCQ' },
  { key: 'true_false', label: '🔘 True/False' },
  { key: 'descriptive', label: '✏️ Descriptive' },
]

export default function QuestionBuilder({ question, index, onChange, onRemove }) {
  const qType = question.type || 'mcq'

  function patch(fields) {
    onChange(index, { ...question, ...fields })
  }

  function changeType(newType) {
    if (newType === 'true_false') {
      patch({
        type: newType,
        options: [
          { text: 'True', is_correct: question.tf_correct === 'true' },
          { text: 'False', is_correct: question.tf_correct === 'false' },
        ],
      })
    } else if (newType === 'mcq' && question.options.length < 4) {
      patch({
        type: newType,
        options: [
          { text: '', is_correct: false },
          { text: '', is_correct: false },
          { text: '', is_correct: false },
          { text: '', is_correct: false },
        ],
      })
    } else {
      patch({ type: newType })
    }
  }

  function setTFCorrect(which) {
    patch({
      tf_correct: which,
      options: [
        { text: 'True', is_correct: which === 'true' },
        { text: 'False', is_correct: which === 'false' },
      ],
    })
  }

  function setCorrectOption(optIdx) {
    patch({ options: question.options.map((o, i) => ({ ...o, is_correct: i === optIdx })) })
  }

  function setOptionText(optIdx, text) {
    patch({ options: question.options.map((o, i) => (i === optIdx ? { ...o, text } : o)) })
  }

  return (
    <div className="rounded-xl border border-border bg-surface-2 p-4">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-6 h-6 rounded-md bg-primary-tint text-primary flex items-center justify-center text-[11px] font-bold shrink-0">
          {index + 1}
        </div>
        <input
          type="text"
          value={question.text}
          onChange={(e) => patch({ text: e.target.value })}
          placeholder="Question text *"
          className="flex-1 rounded-md border border-border bg-surface px-3 py-1.5 text-[12.5px] text-text outline-none"
        />
        <div className="flex flex-col items-center gap-0.5 shrink-0">
          <span className="text-[9px] font-semibold text-text-muted uppercase">Marks</span>
          <input
            type="number"
            min={1}
            value={question.marks}
            onChange={(e) => patch({ marks: Math.max(1, parseFloat(e.target.value) || 1) })}
            title="Marks for this question (no upper limit)"
            className="w-16 rounded-md border border-primary/30 bg-surface px-2 py-1 text-[13px] font-semibold text-primary text-center outline-none"
          />
        </div>
        <button
          type="button"
          onClick={() => onRemove(index)}
          className="w-7 h-7 rounded-md bg-danger-tint border border-danger/25 text-danger flex items-center justify-center shrink-0"
        >
          ✕
        </button>
      </div>

      <div className="flex gap-1.5 flex-wrap mb-3">
        {TYPE_OPTIONS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => changeType(t.key)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold border ${
              qType === t.key ? 'border-primary bg-primary-tint text-primary' : 'border-border text-text-muted'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {qType === 'true_false' && (
        <div>
          <div className="text-[10.5px] font-semibold text-text-muted uppercase tracking-wide mb-2">Select Correct Answer</div>
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={() => setTFCorrect('true')}
              className={`flex-1 rounded-lg py-2.5 text-[13px] font-bold border-2 ${
                (question.tf_correct || 'true') === 'true' ? 'border-primary bg-primary-tint text-primary' : 'border-border text-text-muted'
              }`}
            >
              ✅ TRUE {(question.tf_correct || 'true') === 'true' ? '← Correct' : ''}
            </button>
            <button
              type="button"
              onClick={() => setTFCorrect('false')}
              className={`flex-1 rounded-lg py-2.5 text-[13px] font-bold border-2 ${
                question.tf_correct === 'false' ? 'border-danger bg-danger-tint text-danger' : 'border-border text-text-muted'
              }`}
            >
              ❌ FALSE {question.tf_correct === 'false' ? '← Correct' : ''}
            </button>
          </div>
        </div>
      )}

      {qType === 'mcq' && (
        <div>
          <div className="text-[10.5px] font-semibold text-text-muted uppercase tracking-wide mb-2">Options — select correct answer</div>
          <div className="flex flex-col gap-1.5">
            {question.options.map((opt, oi) => (
              <div key={oi} className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`correct-${index}`}
                  checked={opt.is_correct}
                  onChange={() => setCorrectOption(oi)}
                  title="Mark as correct"
                  className="shrink-0"
                />
                <input
                  type="text"
                  value={opt.text}
                  onChange={(e) => setOptionText(oi, e.target.value)}
                  placeholder={`Option ${oi + 1} *`}
                  className={`flex-1 rounded-md border px-2.5 py-1.5 text-[12px] text-text outline-none ${
                    opt.is_correct ? 'border-primary/40 bg-primary-tint' : 'border-border bg-surface'
                  }`}
                />
                {opt.is_correct && <span className="text-[10px] text-primary shrink-0 whitespace-nowrap">✓ Correct</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {qType === 'descriptive' && (
        <div>
          <div className="text-[10.5px] font-semibold text-text-muted uppercase tracking-wide mb-2">
            Model Answer (for reference / manual review)
          </div>
          <textarea
            rows={3}
            value={question.correct_answer_text}
            onChange={(e) => patch({ correct_answer_text: e.target.value })}
            placeholder="Write the expected/model answer here…"
            className="w-full rounded-md border border-primary/25 bg-primary-tint px-3 py-2 text-[12px] text-text outline-none resize-y"
          />
          <div className="text-[10.5px] text-text-muted mt-1.5">
            ℹ️ Employee will type their answer. Marked as "Submitted" — admin reviews manually.
          </div>
        </div>
      )}
    </div>
  )
}
