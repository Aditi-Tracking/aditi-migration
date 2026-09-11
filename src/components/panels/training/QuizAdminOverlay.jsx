import { useEffect, useState } from 'react'
import OverlayShell from '../../shared/OverlayShell'
import { useAuth } from '../../../context/AuthContext'
import { fetchEmployeeId } from '../../../lib/employeeProfile'
import {
  deleteQuizCascade,
  fetchAdminQuizList,
  fetchQuizForEdit,
  fetchTrainingNodesForSelect,
  saveQuiz,
  toggleQuizActive,
} from '../../../lib/quizAdmin'
import QuestionBuilder from './QuestionBuilder'

function emptyQuestion() {
  return {
    text: '',
    marks: 1,
    type: 'mcq',
    correct_answer_text: '',
    tf_correct: 'true',
    options: [
      { text: '', is_correct: false },
      { text: '', is_correct: false },
      { text: '', is_correct: false },
      { text: '', is_correct: false },
    ],
  }
}

function validate(title, nodeId, questions) {
  if (!title.trim()) return 'Please enter a quiz title'
  if (!nodeId) return 'Please select a training module'
  if (!questions.length) return 'Please add at least one question'
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i]
    if (!q.text.trim()) return `Question ${i + 1}: Please enter question text`
    const qType = q.type || 'mcq'
    if (qType === 'mcq') {
      const hasCorrect = q.options.some((o) => o.is_correct)
      const filledOpts = q.options.filter((o) => o.text.trim())
      if (filledOpts.length < 2) return `Question ${i + 1} (MCQ): Please fill at least 2 options`
      if (!hasCorrect) return `Question ${i + 1} (MCQ): Please select the correct option (green radio button)`
    } else if (qType === 'true_false') {
      if (!q.tf_correct) return `Question ${i + 1} (True/False): Please select which answer is correct`
    }
  }
  return null
}

// Ported from old-portal/js/training.js's openQuizAdmin/saveQuizToDB/
// loadAdminQuizList/toggleQuizActive/deleteQuizFromDB/editQuizFromDB.
// _canUploadQuiz() is re-checked at every mutating action, not just the
// button that opens this overlay — matches production's defense-in-depth.
export default function QuizAdminOverlay({ open, onClose }) {
  const { currentUser, permissions } = useAuth()
  const canManage = permissions.can_upload_quiz === 'true'

  const [tab, setTab] = useState('create')
  const [nodes, setNodes] = useState([])
  const [editingQuizId, setEditingQuizId] = useState(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [nodeId, setNodeId] = useState('')
  const [passingScore, setPassingScore] = useState(60)
  const [timeLimit, setTimeLimit] = useState(15)
  const [questions, setQuestions] = useState([])
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState(null) // { text, ok }

  const [manageList, setManageList] = useState([])
  const [manageLoading, setManageLoading] = useState(true)
  const [manageError, setManageError] = useState('')

  useEffect(() => {
    if (!open) return
    // Reset the form fresh each time the overlay opens — it stays mounted between opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTab('create')
    setEditingQuizId(null)
    setTitle('')
    setDescription('')
    setNodeId('')
    setPassingScore(60)
    setTimeLimit(15)
    setQuestions([])
    setSaveStatus(null)
    setSaving(false)
    fetchTrainingNodesForSelect().then(setNodes)
  }, [open])

  function loadManageList() {
    setManageLoading(true)
    setManageError('')
    fetchAdminQuizList()
      .then(setManageList)
      .catch((e) => setManageError(e.message))
      .finally(() => setManageLoading(false))
  }

  function switchTab(t) {
    setTab(t)
    if (t === 'manage') loadManageList()
  }

  function addQuestion() {
    setQuestions((qs) => [...qs, emptyQuestion()])
  }
  function updateQuestion(idx, next) {
    setQuestions((qs) => qs.map((q, i) => (i === idx ? next : q)))
  }
  function removeQuestion(idx) {
    setQuestions((qs) => qs.filter((_, i) => i !== idx))
  }

  async function handleSave() {
    if (!canManage) {
      alert('⛔ ⛔ Access denied. Only authorised members can save quizzes.')
      return
    }
    const err = validate(title, nodeId, questions)
    if (err) {
      alert(err)
      return
    }

    setSaving(true)
    setSaveStatus(null)
    try {
      let adminEmpId = null
      if (currentUser?.email) adminEmpId = await fetchEmployeeId(currentUser.email)

      await saveQuiz({
        editingQuizId,
        title: title.trim(),
        description: description.trim(),
        nodeId,
        passingScore,
        timeLimit,
        questions,
        adminEmpId,
      })

      setSaveStatus({
        text: editingQuizId
          ? `✅ Quiz "${title}" updated with ${questions.length} questions!`
          : `✅ Quiz "${title}" saved with ${questions.length} questions!`,
        ok: true,
      })
      setEditingQuizId(null)
      setTitle('')
      setDescription('')
      setQuestions([])
    } catch (e) {
      setSaveStatus({ text: '❌ Error: ' + e.message, ok: false })
    } finally {
      setSaving(false)
    }
  }

  async function handleEdit(quizId) {
    if (!canManage) {
      alert('⛔ Only authorised MIS members can edit quizzes.')
      return
    }
    setTab('create')
    try {
      const { quiz, questions: qs } = await fetchQuizForEdit(quizId)
      setTitle(quiz.title || '')
      setDescription(quiz.description || '')
      setPassingScore(quiz.passing_score || 60)
      setTimeLimit(quiz.time_limit || 15)
      setNodeId(quiz.node_id ? String(quiz.node_id) : '')
      setQuestions(qs)
      setEditingQuizId(quizId)
      setSaveStatus(null)
    } catch (e) {
      alert('Edit load error: ' + e.message)
    }
  }

  async function handleToggleActive(quizId, newState) {
    if (!canManage) {
      alert('⛔ Only authorised MIS members can modify quizzes.')
      return
    }
    await toggleQuizActive(quizId, newState)
    loadManageList()
  }

  async function handleDelete(quizId, quizTitle) {
    if (!canManage) {
      alert('⛔ Only authorised MIS members can delete quizzes.')
      return
    }
    if (!confirm(`Delete quiz "${quizTitle}"? This will also delete all questions, options and attempt records.`)) return
    try {
      await deleteQuizCascade(quizId)
      loadManageList()
    } catch (e) {
      alert('Delete error: ' + e.message)
    }
  }

  if (!open) return null

  return (
    <OverlayShell open={open} onClose={onClose} maxWidth="max-w-3xl">
      <div className="text-[15px] font-semibold text-text mb-3 pr-8">Quiz Management</div>

      <div className="flex gap-1.5 border-b border-border mb-4">
        <button
          type="button"
          onClick={() => switchTab('create')}
          className={`px-3.5 py-2 text-[12.5px] font-medium border-b-2 -mb-px ${
            tab === 'create' ? 'border-primary text-primary' : 'border-transparent text-text-muted'
          }`}
        >
          {editingQuizId ? '✏️ Edit Quiz' : '➕ Create'}
        </button>
        <button
          type="button"
          onClick={() => switchTab('manage')}
          className={`px-3.5 py-2 text-[12.5px] font-medium border-b-2 -mb-px ${
            tab === 'manage' ? 'border-primary text-primary' : 'border-transparent text-text-muted'
          }`}
        >
          🗂 Manage
        </button>
      </div>

      {tab === 'create' && (
        <div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-[11px] font-medium text-text-muted mb-1.5">Quiz Title *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[12.5px] text-text outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-text-muted mb-1.5">Training Module *</label>
              <select
                value={nodeId}
                onChange={(e) => setNodeId(e.target.value)}
                className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[12.5px] text-text outline-none"
              >
                <option value="">— Select Training Module —</option>
                {nodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mb-3">
            <label className="block text-[11px] font-medium text-text-muted mb-1.5">Description</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[12.5px] text-text outline-none resize-y"
            />
          </div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="block text-[11px] font-medium text-text-muted mb-1.5">Passing Score (%)</label>
              <input
                type="number"
                min={1}
                max={100}
                value={passingScore}
                onChange={(e) => setPassingScore(parseInt(e.target.value, 10) || 60)}
                className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[12.5px] text-text outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-text-muted mb-1.5">Time Limit (minutes)</label>
              <input
                type="number"
                min={1}
                value={timeLimit}
                onChange={(e) => setTimeLimit(parseInt(e.target.value, 10) || 15)}
                className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-[12.5px] text-text outline-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-between mb-2.5">
            <div className="text-[12px] font-semibold text-text-muted uppercase tracking-wide">Questions</div>
            <button
              type="button"
              onClick={addQuestion}
              className="text-[11.5px] font-medium text-primary bg-primary-tint border border-primary/20 rounded-md px-2.5 py-1"
            >
              + Add Question
            </button>
          </div>

          {!questions.length && <div className="text-center py-8 text-text-muted text-[12px] border border-dashed border-border rounded-lg mb-4">No questions yet.</div>}

          <div className="flex flex-col gap-3 mb-4">
            {questions.map((q, idx) => (
              <QuestionBuilder key={idx} question={q} index={idx} onChange={updateQuestion} onRemove={removeQuestion} />
            ))}
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="w-full rounded-md bg-primary text-white text-[13px] font-medium py-2.5 disabled:opacity-60"
          >
            {saving ? 'Saving…' : editingQuizId ? '✏️ Update Quiz' : '💾 Save Quiz'}
          </button>
          {saveStatus && (
            <div className={`mt-3 rounded-md px-3 py-2 text-[12px] font-medium text-center ${saveStatus.ok ? 'bg-primary-tint text-primary' : 'bg-danger-tint text-danger'}`}>
              {saveStatus.text}
            </div>
          )}
        </div>
      )}

      {tab === 'manage' && (
        <div>
          {manageLoading && <div className="text-center py-10 text-text-muted text-[12.5px]">Loading…</div>}
          {!manageLoading && manageError && <div className="text-center py-10 text-danger text-[12.5px]">⚠️ {manageError}</div>}
          {!manageLoading && !manageError && !manageList.length && (
            <div className="text-center py-10 text-text-muted text-[12.5px]">No quizzes yet.</div>
          )}
          <div className="flex flex-col gap-2.5">
            {manageList.map((q) => (
              <div key={q.id} className="flex items-center gap-3 flex-wrap rounded-lg border border-border bg-surface-2 px-3.5 py-3">
                <div className="flex-1 min-w-[160px]">
                  <div className="text-[12.5px] font-semibold text-text">{q.title}</div>
                  <div className="text-[10.5px] text-text-muted mt-0.5">
                    📚 {q.content_nodes?.name || '—'} · ⏱ {q.time_limit || '—'}min
                  </div>
                </div>
                <div className="text-[11px] font-medium text-text-muted">{q.is_active ? '🟢 Active' : '🔴 Inactive'}</div>
                <button
                  type="button"
                  onClick={() => handleEdit(q.id)}
                  className="text-[11.5px] font-medium text-primary bg-primary-tint border border-primary/20 rounded-md px-2.5 py-1"
                >
                  ✏️ Edit
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleActive(q.id, !q.is_active)}
                  className="text-[11.5px] font-medium text-text-muted border border-border rounded-md px-2.5 py-1"
                >
                  {q.is_active ? 'Deactivate' : 'Activate'}
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(q.id, q.title)}
                  className="text-[11.5px] font-medium text-danger bg-danger-tint border border-danger/20 rounded-md px-2.5 py-1"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </OverlayShell>
  )
}
