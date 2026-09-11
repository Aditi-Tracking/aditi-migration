import { SB_HDRS, SB_HDRS_MIN, SB_HDRS_REPR, SUPABASE_URL } from './supabaseClient'
import { CN } from './contentNodes'

// Ported from old-portal/js/training.js's MIS quiz admin + Grade Overlay
// (populateNodeSelect, saveQuizToDB, loadAdminQuizList, toggleQuizActive,
// deleteQuizFromDB, editQuizFromDB, goLoadAll, goSaveMark).

const jsonHdrs = () => ({ ...SB_HDRS(), 'Content-Type': 'application/json', Prefer: 'return=minimal' })

export async function fetchTrainingNodesForSelect() {
  await CN.load()
  const section = CN.getSection('Training')
  if (section) {
    const cats = CN.getCategories(section.id)
    if (cats.length) return cats.map((c) => ({ id: c.id, name: c.name }))
  }
  // Fallback: all content_node sections, matching old-portal exactly.
  const res = await fetch(`${SUPABASE_URL}/rest/v1/content_nodes?select=id,name&type=eq.section&order=name.asc`, {
    headers: SB_HDRS(),
  })
  const rows = await res.json()
  return Array.isArray(rows) ? rows.map((n) => ({ id: n.id, name: n.name })) : []
}

export async function fetchAdminQuizList() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/quizzes?select=*,content_nodes(name)&order=id.desc`, { headers: SB_HDRS() })
  if (!res.ok) throw new Error('Could not load quizzes (' + res.status + ')')
  return res.json()
}

export async function toggleQuizActive(quizId, newState) {
  await fetch(`${SUPABASE_URL}/rest/v1/quizzes?id=eq.${quizId}`, {
    method: 'PATCH',
    headers: jsonHdrs(),
    body: JSON.stringify({ is_active: newState }),
  })
}

// Manual cascade delete, same order as old-portal: answers -> quiz_attempts
// -> options -> questions -> quizzes.
export async function deleteQuizCascade(quizId) {
  await fetch(`${SUPABASE_URL}/rest/v1/answers?attempt_id=in.(select id from quiz_attempts where quiz_id=eq.${quizId})`, {
    method: 'DELETE',
    headers: SB_HDRS(),
  }).catch(() => {})
  await fetch(`${SUPABASE_URL}/rest/v1/quiz_attempts?quiz_id=eq.${quizId}`, { method: 'DELETE', headers: SB_HDRS() })
  await fetch(`${SUPABASE_URL}/rest/v1/options?question_id=in.(select id from questions where quiz_id=eq.${quizId})`, {
    method: 'DELETE',
    headers: SB_HDRS(),
  }).catch(() => {})
  await fetch(`${SUPABASE_URL}/rest/v1/questions?quiz_id=eq.${quizId}`, { method: 'DELETE', headers: SB_HDRS() })
  await fetch(`${SUPABASE_URL}/rest/v1/quizzes?id=eq.${quizId}`, { method: 'DELETE', headers: SB_HDRS() })
}

// Loads a quiz + its questions/options back into the question-builder shape
// used by the create/edit form — mirrors editQuizFromDB exactly.
export async function fetchQuizForEdit(quizId) {
  const qRes = await fetch(`${SUPABASE_URL}/rest/v1/quizzes?id=eq.${quizId}&select=*`, { headers: SB_HDRS() })
  const qArr = await qRes.json()
  const quiz = qArr[0]
  if (!quiz) throw new Error('Quiz not found')

  const qqRes = await fetch(`${SUPABASE_URL}/rest/v1/questions?quiz_id=eq.${quizId}&select=*&order=id.asc`, { headers: SB_HDRS() })
  const qqArr = await qqRes.json()

  const optMap = {}
  if (qqArr.length) {
    const qIds = qqArr.map((q) => q.id).join(',')
    const opRes = await fetch(`${SUPABASE_URL}/rest/v1/options?question_id=in.(${qIds})&select=*&order=id.asc`, { headers: SB_HDRS() })
    const opArr = await opRes.json()
    opArr.forEach((o) => {
      ;(optMap[o.question_id] = optMap[o.question_id] || []).push(o)
    })
  }

  const questions = qqArr.map((q) => {
    const qType = q.question_type || 'mcq'
    const opts = optMap[q.id] || []
    const tfCorrect = qType === 'true_false' ? opts.find((o) => o.is_correct)?.option_text?.toLowerCase() || 'true' : 'true'
    return {
      text: q.question_text || '',
      marks: q.marks || 1,
      type: qType,
      correct_answer_text: q.correct_answer_text || '',
      tf_correct: tfCorrect,
      options:
        qType === 'mcq'
          ? opts.length
            ? opts.map((o) => ({ text: o.option_text, is_correct: o.is_correct }))
            : [
                { text: '', is_correct: false },
                { text: '', is_correct: false },
                { text: '', is_correct: false },
                { text: '', is_correct: false },
              ]
          : qType === 'true_false'
            ? [
                { text: 'True', is_correct: tfCorrect === 'true' },
                { text: 'False', is_correct: tfCorrect === 'false' },
              ]
            : [],
    }
  })

  return { quiz, questions }
}

// Create (POST) or edit (PATCH + full delete-and-reinsert of
// questions/options) — same as old-portal, not an incremental edit.
export async function saveQuiz({ editingQuizId, title, description, nodeId, passingScore, timeLimit, questions, adminEmpId }) {
  const quizBody = {
    title,
    description,
    node_id: parseInt(nodeId, 10),
    passing_score: passingScore,
    time_limit: timeLimit,
  }

  let quizId
  if (editingQuizId) {
    await fetch(`${SUPABASE_URL}/rest/v1/quizzes?id=eq.${editingQuizId}`, {
      method: 'PATCH',
      headers: jsonHdrs(),
      body: JSON.stringify(quizBody),
    })
    quizId = editingQuizId

    await fetch(`${SUPABASE_URL}/rest/v1/options?question_id=in.(select id from questions where quiz_id=eq.${quizId})`, {
      method: 'DELETE',
      headers: SB_HDRS(),
    }).catch(() => {})
    await fetch(`${SUPABASE_URL}/rest/v1/questions?quiz_id=eq.${quizId}`, { method: 'DELETE', headers: SB_HDRS() })
  } else {
    quizBody.is_active = true
    if (adminEmpId) quizBody.created_by = adminEmpId

    const qRes = await fetch(`${SUPABASE_URL}/rest/v1/quizzes`, {
      method: 'POST',
      headers: SB_HDRS_REPR(),
      body: JSON.stringify(quizBody),
    })
    const qArr = await qRes.json()
    quizId = Array.isArray(qArr) ? qArr[0]?.id : qArr?.id
    if (!quizId) throw new Error('Quiz save failed: ' + JSON.stringify(qArr))
  }

  for (const q of questions) {
    const qType = q.type || 'mcq'
    const qqBody = {
      quiz_id: quizId,
      question_text: q.text.trim(),
      question_type: qType,
      marks: q.marks || 1,
      correct_answer_text: qType === 'descriptive' ? q.correct_answer_text || null : null,
    }
    if (adminEmpId && !editingQuizId) qqBody.created_by = adminEmpId

    const qqRes = await fetch(`${SUPABASE_URL}/rest/v1/questions`, {
      method: 'POST',
      headers: SB_HDRS_REPR(),
      body: JSON.stringify(qqBody),
    })
    const qqArr = await qqRes.json()
    const qId = Array.isArray(qqArr) ? qqArr[0]?.id : qqArr?.id
    if (!qId) throw new Error('Question save failed: ' + JSON.stringify(qqArr))

    if (qType === 'mcq') {
      const validOpts = q.options.filter((o) => o.text.trim())
      if (validOpts.length) {
        await fetch(`${SUPABASE_URL}/rest/v1/options`, {
          method: 'POST',
          headers: SB_HDRS_MIN(),
          body: JSON.stringify(validOpts.map((o) => ({ question_id: qId, option_text: o.text.trim(), is_correct: o.is_correct }))),
        })
      }
    } else if (qType === 'true_false') {
      const tfOpts = [
        { question_id: qId, option_text: 'True', is_correct: (q.tf_correct || 'true') === 'true' },
        { question_id: qId, option_text: 'False', is_correct: (q.tf_correct || 'true') === 'false' },
      ]
      await fetch(`${SUPABASE_URL}/rest/v1/options`, { method: 'POST', headers: SB_HDRS_MIN(), body: JSON.stringify(tfOpts) })
    }
  }

  return quizId
}

// ── Grade Overlay ──────────────────────────────────────────────────────────

export async function fetchAllAttemptsForGrading() {
  const [qRes, aRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/quizzes?select=id,title,passing_score,content_nodes(name)&order=id.asc`, { headers: SB_HDRS() }),
    fetch(
      `${SUPABASE_URL}/rest/v1/quiz_attempts?select=id,quiz_id,attempt_number,score,total_marks,started_at,submitted_at,Employee_details(Employee_name,Employee_Dept)&order=id.desc`,
      { headers: SB_HDRS() }
    ),
  ])
  const quizzes = await qRes.json()
  const attempts = await aRes.json()

  const questionsByQuiz = {}
  if (quizzes.length) {
    const ids = quizzes.map((q) => q.id).join(',')
    const qqRes = await fetch(`${SUPABASE_URL}/rest/v1/questions?select=id,quiz_id,question_type,marks&quiz_id=in.(${ids})`, {
      headers: SB_HDRS(),
    })
    const allQs = await qqRes.json()
    quizzes.forEach((q) => {
      questionsByQuiz[q.id] = allQs.filter((qq) => qq.quiz_id === q.id)
    })
  }

  const gradedMap = {}
  if (attempts.length) {
    const attemptIds = attempts.map((a) => a.id).join(',')
    const ansRes = await fetch(
      `${SUPABASE_URL}/rest/v1/answers?select=attempt_id,marks_awarded,questions(question_type)&attempt_id=in.(${attemptIds})`,
      { headers: SB_HDRS() }
    )
    const allAnswers = await ansRes.json()
    allAnswers.forEach((ans) => {
      const qType = (ans.questions?.question_type || '').toLowerCase()
      if (qType !== 'descriptive') return
      if (!(ans.attempt_id in gradedMap)) gradedMap[ans.attempt_id] = true
      if (ans.marks_awarded == null) gradedMap[ans.attempt_id] = false
    })
  }

  return { quizzes, attempts, questionsByQuiz, gradedMap }
}

export async function fetchAttemptAnswersForGrading(attemptId) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/answers?select=id,answer_text,marks_awarded,selected_option_id,questions(id,question_text,question_type,marks,correct_answer_text),options!answers_selected_option_id_fkey(option_text,is_correct)&attempt_id=eq.${attemptId}&order=id.asc`,
    { headers: SB_HDRS() }
  )
  const answers = await res.json()
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

// Save one descriptive mark, then recompute + patch the attempt's total
// score (MCQ auto-marks + all descriptive marks_awarded) — same as
// goSaveMark exactly.
export async function saveDescriptiveMark({ answerId, attemptId, marks }) {
  await fetch(`${SUPABASE_URL}/rest/v1/answers?id=eq.${answerId}`, {
    method: 'PATCH',
    headers: jsonHdrs(),
    body: JSON.stringify({ marks_awarded: marks }),
  })

  const aRes = await fetch(
    `${SUPABASE_URL}/rest/v1/answers?select=id,selected_option_id,marks_awarded,questions(marks,question_type),options!answers_selected_option_id_fkey(is_correct)&attempt_id=eq.${attemptId}`,
    { headers: SB_HDRS() }
  )
  const allAns = await aRes.json()

  let newScore = 0
  allAns.forEach((a) => {
    const qType = (a.questions?.question_type || 'mcq').toLowerCase()
    const qMarks = a.questions?.marks || 1
    if (qType === 'descriptive') {
      newScore += a.id === answerId ? marks : a.marks_awarded || 0
    } else if (a.options?.is_correct) {
      newScore += qMarks
    }
  })

  await fetch(`${SUPABASE_URL}/rest/v1/quiz_attempts?id=eq.${attemptId}`, {
    method: 'PATCH',
    headers: jsonHdrs(),
    body: JSON.stringify({ score: newScore }),
  })

  const stillUngraded = allAns.some((a) => {
    const qType = (a.questions?.question_type || '').toLowerCase()
    if (qType !== 'descriptive') return false
    if (a.id === answerId) return false
    return a.marks_awarded == null
  })

  return { newScore, fullyGraded: !stillUngraded }
}
