import { useEffect, useMemo, useState } from 'react'
import OverlayShell from '../../shared/OverlayShell'
import { useAuth } from '../../../context/AuthContext'
import { fetchEmployeeId } from '../../../lib/employeeProfile'
import { fetchAttemptDetail, fetchGradedMap, fetchMyResults, fetchQuizHasDescriptiveMap } from '../../../lib/quizzes'

// Ported from old-portal/js/training.js's openMyQuizResults/mqrRenderStats/
// mqrRenderList/mqrLoadAnswers. MIS (can_upload_quiz) sees everyone's
// attempts with name/quiz filters; everyone else sees only their own.
function fmtDate(row) {
  const d = row.submitted_at || row.started_at
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function MyResultsOverlay({ open, onClose }) {
  const { currentUser, permissions } = useAuth()
  const isMIS = permissions.can_upload_quiz === 'true'

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rows, setRows] = useState([])
  const [gradedMap, setGradedMap] = useState({})
  const [hasDescMap, setHasDescMap] = useState({})
  const [quizFilter, setQuizFilter] = useState('')
  const [nameFilter, setNameFilter] = useState('')
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets fresh each time the overlay opens
    setLoading(true)
    setError('')
    setQuizFilter('')
    setNameFilter('')
    setExpandedId(null)

    async function load() {
      try {
        let empId = null
        if (!isMIS && currentUser?.email) empId = await fetchEmployeeId(currentUser.email)
        if (cancelled) return
        if (!isMIS && !empId) {
          // Safety guard — never show someone else's data if we can't resolve empId.
          setRows([])
          setLoading(false)
          return
        }
        const data = await fetchMyResults({ isMIS, empId })
        if (cancelled) return

        const quizIds = [...new Set(data.map((r) => r.quiz_id).filter(Boolean))]
        const attemptIds = data.map((r) => r.id)
        const [descMap, graded] = await Promise.all([fetchQuizHasDescriptiveMap(quizIds), fetchGradedMap(attemptIds)])
        if (cancelled) return

        setRows(data)
        setHasDescMap(descMap)
        setGradedMap(graded)
        setLoading(false)
      } catch (e) {
        if (cancelled) return
        setError(e.message)
        setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [open, isMIS, currentUser])

  const quizOptions = useMemo(() => {
    const map = {}
    rows.forEach((r) => {
      if (r.quizzes?.id) map[r.quizzes.id] = r.quizzes.title
    })
    return Object.entries(map)
  }, [rows])

  const nameOptions = useMemo(() => {
    const set = new Set()
    rows.forEach((r) => {
      const n = r.Employee_details?.Employee_name
      if (n) set.add(n)
    })
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [rows])

  function statusFor(row) {
    const inProgress = !row.submitted_at
    const hasDesc = !!hasDescMap[row.quiz_id]
    const isPending = !inProgress && hasDesc && ((row.score ?? 0) === 0 || gradedMap[row.id] === false)
    const pct = row.total_marks > 0 ? Math.round((row.score / row.total_marks) * 100) : 0
    const passed = !inProgress && !isPending && pct >= (row.quizzes?.passing_score || 60)
    return { inProgress, isPending, passed, pct }
  }

  const filtered = rows.filter((r) => {
    if (quizFilter && String(r.quizzes?.id) !== quizFilter) return false
    if (nameFilter && (r.Employee_details?.Employee_name || '') !== nameFilter) return false
    return true
  })

  const submitted = filtered.filter((r) => r.submitted_at)
  const stats = {
    total: filtered.length,
    passed: submitted.filter((r) => statusFor(r).passed).length,
    failed: submitted.filter((r) => {
      const s = statusFor(r)
      return !s.isPending && !s.passed
    }).length,
    pending: submitted.filter((r) => statusFor(r).isPending).length,
  }

  if (!open) return null

  return (
    <OverlayShell open={open} onClose={onClose} maxWidth="max-w-2xl">
      <div className="pr-8 mb-4">
        <div className="text-[15px] font-semibold text-text">{isMIS ? 'All Quiz Results' : 'My Quiz Results'}</div>
        <div className="text-[11.5px] text-text-muted mt-0.5">
          {isMIS ? 'All employees quiz attempts and performance' : 'Your quiz attempts and performance'}
        </div>
      </div>

      {loading && <div className="text-center py-12 text-text-muted text-[12.5px]">Loading…</div>}
      {!loading && error && <div className="text-center py-12 text-danger text-[12.5px]">⚠️ {error}</div>}

      {!loading && !error && (
        <>
          <div className="flex gap-2.5 flex-wrap mb-4">
            <select value={quizFilter} onChange={(e) => setQuizFilter(e.target.value)} className="rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-[12px] text-text">
              <option value="">📝 All Quizzes</option>
              {quizOptions.map(([id, title]) => (
                <option key={id} value={id}>
                  {title}
                </option>
              ))}
            </select>
            {isMIS && (
              <select value={nameFilter} onChange={(e) => setNameFilter(e.target.value)} className="rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-[12px] text-text">
                <option value="">👤 All Employees</option>
                {nameOptions.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            )}
          </div>

          {rows.length > 0 && (
            <div className="grid grid-cols-4 gap-2.5 mb-4">
              <StatCard label="Total Attempts" value={stats.total} />
              <StatCard label="Passed" value={stats.passed} />
              <StatCard label="Failed" value={stats.failed} />
              <StatCard label="Pending" value={stats.pending} />
            </div>
          )}

          {!filtered.length && <div className="text-center py-10 text-text-muted text-[12.5px]">No quiz attempts found.</div>}

          <div className="flex flex-col gap-2.5">
            {filtered.map((row) => {
              const s = statusFor(row)
              const statusLabel = s.inProgress ? '🔄 In Progress' : s.isPending ? '⏳ Pending' : s.passed ? '✅ Pass' : '❌ Fail'
              return (
                <div key={row.id} className="rounded-lg border border-border bg-surface-2 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setExpandedId((id) => (id === row.id ? null : row.id))}
                    className="w-full flex items-center gap-3 px-3.5 py-3 text-left"
                  >
                    <div className="flex-1 min-w-0">
                      {isMIS && row.Employee_details?.Employee_name && (
                        <div className="text-[10.5px] font-medium text-primary mb-0.5">
                          👤 {row.Employee_details.Employee_name}
                          {row.Employee_details?.Employee_Dept ? ` · ${row.Employee_details.Employee_Dept}` : ''}
                        </div>
                      )}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[12.5px] font-medium text-text">{row.quizzes?.title || 'Quiz'}</span>
                        <span className="text-[10px] font-medium text-primary bg-primary-tint border border-primary/20 rounded-full px-2 py-0.5">
                          Attempt #{row.attempt_number || 1}
                        </span>
                      </div>
                      <div className="text-[10.5px] text-text-muted mt-0.5">📅 {fmtDate(row)}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[14px] font-bold text-text">{s.inProgress ? '—' : `${s.pct}%`}</div>
                      <div className="text-[10px] text-text-muted">
                        {row.score ?? 0}/{row.total_marks ?? 0} pts
                      </div>
                    </div>
                    <span className="text-[11px] font-semibold text-text-muted bg-surface border border-border rounded-full px-2.5 py-1 shrink-0">
                      {statusLabel}
                    </span>
                  </button>
                  {expandedId === row.id && <AttemptDetail attemptId={row.id} />}
                </div>
              )
            })}
          </div>
        </>
      )}
    </OverlayShell>
  )
}

function StatCard({ label, value }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-center">
      <div className="text-[17px] font-bold text-text">{value}</div>
      <div className="text-[9.5px] text-text-muted mt-0.5 uppercase tracking-wide">{label}</div>
    </div>
  )
}

function AttemptDetail({ attemptId }) {
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-time fetch
    setLoading(true)
    fetchAttemptDetail(attemptId).then((d) => {
      if (cancelled) return
      setDetail(d)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [attemptId])

  if (loading) return <div className="text-center py-4 text-text-muted text-[11.5px] border-t border-border">Loading…</div>
  if (!detail?.answers.length) {
    return <div className="text-center py-4 text-text-muted text-[11.5px] border-t border-border">No answers recorded.</div>
  }

  return (
    <div className="border-t border-border px-3.5 py-3 bg-surface">
      <div className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-2">Your Answers</div>
      <div className="flex flex-col gap-2">
        {detail.answers.map((ans, i) => {
          const qType = (ans.questions?.question_type || 'mcq').toLowerCase()
          const opts = detail.optionsByQuestion[ans.questions?.id] || []
          if (qType === 'descriptive') {
            const awarded = ans.marks_awarded != null ? `${ans.marks_awarded}/${ans.questions?.marks || 1}` : `Pending/${ans.questions?.marks || 1}`
            return (
              <div key={ans.id} className="rounded-md bg-surface-2 border border-border px-3 py-2.5">
                <div className="flex items-center gap-2 mb-1.5 text-[10.5px] text-text-muted">
                  <span>Q{i + 1}</span>
                  <span className="text-primary bg-primary-tint border border-primary/20 rounded px-1.5 py-0.5">✏️ Descriptive</span>
                  <span className="ml-auto font-medium">{awarded} marks</span>
                </div>
                <div className="text-[12px] font-medium text-text mb-1.5">{ans.questions?.question_text}</div>
                <div className="text-[11.5px] text-text-muted bg-surface rounded px-2.5 py-2 border border-border">
                  {ans.answer_text || 'Not answered'}
                </div>
              </div>
            )
          }
          const isRight = ans.options?.is_correct === true
          return (
            <div key={ans.id} className={`rounded-md bg-surface-2 border px-3 py-2.5 ${isRight ? 'border-primary/30' : 'border-border'}`}>
              <div className="flex items-center gap-2 mb-1.5 text-[10.5px] text-text-muted">
                <span>Q{i + 1}</span>
                <span className="text-primary bg-primary-tint border border-primary/20 rounded px-1.5 py-0.5">{qType === 'true_false' ? '🔘 T/F' : '☑ MCQ'}</span>
                <span className={`ml-auto font-medium ${isRight ? 'text-primary' : 'text-danger'}`}>
                  {isRight ? '✅' : '❌'} {isRight ? ans.questions?.marks || 1 : 0}/{ans.questions?.marks || 1}
                </span>
              </div>
              <div className="text-[12px] font-medium text-text mb-1.5">{ans.questions?.question_text}</div>
              <div className="flex flex-col gap-1">
                {opts.map((o) => {
                  const isSel = o.id === ans.selected_option_id
                  return (
                    <div
                      key={o.id}
                      className={`text-[11.5px] rounded px-2 py-1 border ${
                        isSel && o.is_correct
                          ? 'border-primary/40 bg-primary-tint text-primary'
                          : isSel && !o.is_correct
                            ? 'border-danger/30 bg-danger-tint text-danger'
                            : !isSel && o.is_correct
                              ? 'border-primary/20 text-primary'
                              : 'border-border text-text-muted'
                      }`}
                    >
                      {isSel ? '●' : '○'} {o.option_text}
                      {!isSel && o.is_correct ? ' ← Correct' : ''}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
