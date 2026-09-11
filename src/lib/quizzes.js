import { SB_HDRS, SB_HDRS_MIN, SB_HDRS_REPR, SUPABASE_URL } from './supabaseClient'

// Ported from old-portal/js/training.js's quiz-taking flow (Preview → Take
// Quiz → Result → My Results). Scoring is intentionally 100% client-side
// with no server-side recompute/verification — that's exactly how
// old-portal works today, not something to "fix" here.

function fetchWithTimeout(url, options, ms = 15000) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  return fetch(url, { ...options, signal: ctrl.signal }).finally(() => clearTimeout(timer))
}

// Quiz list scoped to a Training module (node_id) — same query as
// _loadMktQuizPanel, the live mechanism (not the dead db-quiz-grid path).
export async function fetchQuizzesForNode(nodeId) {
  const nodeFilter = nodeId ? `&node_id=eq.${nodeId}` : ''
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/quizzes?select=*,content_nodes(name),questions(marks)&is_active=eq.true${nodeFilter}&order=id.desc`,
    { headers: SB_HDRS() }
  )
  if (!res.ok) return []
  return res.json()
}

// Ported from openQuizPreview — quiz meta + question-type counts for the
// Preview popup.
export async function fetchQuizPreview(quizId) {
  const [qRes, qqRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/quizzes?id=eq.${quizId}&select=*,content_nodes(name)`, { headers: SB_HDRS() }),
    fetch(`${SUPABASE_URL}/rest/v1/questions?quiz_id=eq.${quizId}&select=id,question_type`, { headers: SB_HDRS() }),
  ])
  const qArr = await qRes.json()
  const quiz = qArr[0]
  if (!quiz) throw new Error('Quiz not found')
  const questionTypes = await qqRes.json()
  return { quiz, questionTypes }
}

// Ported from startDBQuiz's quiz+questions fetch.
export async function fetchQuizWithQuestions(quizId) {
  const [qRes, qqRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/quizzes?id=eq.${quizId}&select=*`, { headers: SB_HDRS() }),
    fetch(`${SUPABASE_URL}/rest/v1/questions?quiz_id=eq.${quizId}&select=*,options(*)&order=id.asc`, { headers: SB_HDRS() }),
  ])
  const qArr = await qRes.json()
  if (!Array.isArray(qArr) || !qArr.length) throw new Error('Quiz not found')
  const questions = await qqRes.json()
  if (!questions.length) throw new Error('No questions added yet. Ask admin to add questions.')
  return { quiz: qArr[0], questions }
}

// attempt_number = count of this employee's prior attempts on this quiz + 1.
export async function countPriorAttempts(quizId, empId) {
  let url = `${SUPABASE_URL}/rest/v1/quiz_attempts?quiz_id=eq.${quizId}&select=id`
  if (empId) url += `&employee_id=eq.${empId}`
  try {
    const res = await fetch(url, { headers: { ...SB_HDRS(), Prefer: 'count=exact', Range: '0-0' } })
    return parseInt(res.headers.get('Content-Range')?.split('/')[1] || '0', 10)
  } catch {
    return 0
  }
}

export async function createQuizAttempt({ quizId, attemptNumber, empId }) {
  const body = { quiz_id: quizId, attempt_number: attemptNumber, started_at: new Date().toISOString() }
  if (empId) body.employee_id = empId
  const res = await fetch(`${SUPABASE_URL}/rest/v1/quiz_attempts`, {
    method: 'POST',
    headers: SB_HDRS_REPR(),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const errBody = await res.text()
    throw new Error(`Could not start quiz (${res.status}). DB said: ${errBody.substring(0, 120)}`)
  }
  const arr = await res.json()
  const id = Array.isArray(arr) ? arr[0]?.id : arr?.id
  if (!id) throw new Error('Quiz attempt record was not created. Check Supabase RLS on quiz_attempts table.')
  return id
}

// MCQ/True-False go through an RPC first (submit_quiz_answers), falling
// back to a raw insert into `answers` if the RPC fails — same resilience
// as old-portal, preserved exactly.
export async function submitQuizAnswers({ mcqRows, descRows }) {
  if (mcqRows.length > 0) {
    let rpcOk = false
    try {
      const rpcRes = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/rpc/submit_quiz_answers`, {
        method: 'POST',
        headers: SB_HDRS(),
        body: JSON.stringify({ payload: mcqRows }),
      })
      rpcOk = rpcRes.ok || rpcRes.status === 204
    } catch {
      /* fall through to raw insert */
    }
    if (!rpcOk) {
      const insRes = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/answers`, {
        method: 'POST',
        headers: SB_HDRS_MIN(),
        body: JSON.stringify(mcqRows),
      })
      if (!insRes.ok) {
        const errTxt = await insRes.text().catch(() => String(insRes.status))
        throw new Error(`MCQ answers failed (${insRes.status}): ${errTxt}`)
      }
    }
  }
  if (descRows.length > 0) {
    const dRes = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/answers`, {
      method: 'POST',
      headers: SB_HDRS_MIN(),
      body: JSON.stringify(descRows),
    })
    if (!dRes.ok) {
      const errTxt = await dRes.text().catch(() => String(dRes.status))
      throw new Error(`Descriptive answers failed (${dRes.status}): ${errTxt}`)
    }
  }
}

export async function patchAttemptScore(attemptId, { score, totalMarks }) {
  await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/quiz_attempts?id=eq.${attemptId}`, {
    method: 'PATCH',
    headers: SB_HDRS_MIN(),
    body: JSON.stringify({ submitted_at: new Date().toISOString(), score, total_marks: totalMarks }),
  })
}

// My Results: own attempts, or everyone's if isMIS (can_upload_quiz).
export async function fetchMyResults({ isMIS, empId }) {
  if (!isMIS && !empId) return []
  const empSelect = isMIS ? ',Employee_details(Employee_name,Employee_Dept)' : ''
  const empFilter = isMIS ? '' : `&employee_id=eq.${empId}`
  const url = `${SUPABASE_URL}/rest/v1/quiz_attempts?select=id,quiz_id,employee_id,attempt_number,score,total_marks,started_at,submitted_at,quizzes(id,title,passing_score)${empSelect}${empFilter}&order=id.desc&limit=200`
  const res = await fetch(url, { headers: SB_HDRS() })
  if (!res.ok) throw new Error('Could not load quiz results (' + res.status + ')')
  return res.json()
}

// quizId -> true if that quiz has any descriptive question (used to detect
// "pending grading" attempts).
export async function fetchQuizHasDescriptiveMap(quizIds) {
  if (!quizIds.length) return {}
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/questions?select=quiz_id,question_type&quiz_id=in.(${quizIds.join(',')})`,
    { headers: SB_HDRS() }
  )
  const rows = await res.json()
  const map = {}
  rows.forEach((q) => {
    if ((q.question_type || '').toLowerCase() === 'descriptive') map[q.quiz_id] = true
  })
  return map
}

// attemptId -> true (all descriptive answers graded) / false (at least one
// still has marks_awarded === null). A saved 0 counts as graded.
export async function fetchGradedMap(attemptIds) {
  if (!attemptIds.length) return {}
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/answers?select=attempt_id,marks_awarded,questions(question_type)&attempt_id=in.(${attemptIds.join(',')})`,
    { headers: SB_HDRS() }
  )
  const rows = await res.json()
  const map = {}
  rows.forEach((ans) => {
    const qType = (ans.questions?.question_type || '').toLowerCase()
    if (qType !== 'descriptive') return
    if (!(ans.attempt_id in map)) map[ans.attempt_id] = true
    if (ans.marks_awarded == null) map[ans.attempt_id] = false
  })
  return map
}

// Full per-question answer detail for one attempt (My Results row expand).
export async function fetchAttemptDetail(attemptId) {
  const ansRes = await fetch(
    `${SUPABASE_URL}/rest/v1/answers?select=id,answer_text,marks_awarded,selected_option_id,questions(id,question_text,question_type,marks,correct_answer_text),options!answers_selected_option_id_fkey(option_text,is_correct)&attempt_id=eq.${attemptId}&order=id.asc`,
    { headers: SB_HDRS() }
  )
  const answers = await ansRes.json()
  if (!answers.length) return { answers: [], optionsByQuestion: {} }

  const qIds = [...new Set(answers.map((a) => a.questions?.id).filter(Boolean))]
  let allOpts = []
  if (qIds.length) {
    const or = await fetch(
      `${SUPABASE_URL}/rest/v1/options?select=id,question_id,option_text,is_correct&question_id=in.(${qIds.join(',')})`,
      { headers: SB_HDRS() }
    )
    allOpts = await or.json()
  }
  const optionsByQuestion = {}
  allOpts.forEach((o) => {
    ;(optionsByQuestion[o.question_id] = optionsByQuestion[o.question_id] || []).push(o)
  })
  return { answers, optionsByQuestion }
}
