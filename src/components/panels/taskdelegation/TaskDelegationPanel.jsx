import { useEffect, useState } from 'react'
import TabButton from '../../shared/TabButton'
import { useTaskDelegationNav } from '../../../context/TaskDelegationNavContext'
import {
  buildTaskAssigneeMap,
  fetchAllTasksForMD,
  fetchAssignees,
  fetchMyTasks,
  fetchTaskAssigneeLinks,
  setAssigneeActive,
} from '../../../lib/taskDelegation'
import AssigneesTab from './AssigneesTab'
import AllTasksTab from './AllTasksTab'
import MyTasksView from './MyTasksView'
import AddAssigneeModal from './AddAssigneeModal'
import TaskFormModal from './TaskFormModal'
import TaskDetailModal from './TaskDetailModal'

const TABS = [
  ['alltasks', '📋 All Delegated Tasks'],
  ['assignees', '👥 Manage Assignees'],
]

// Ported from old-portal/js/taskDelegation.js's loadTaskDelegation/tdRender/_tdFetchAll. Access is
// a direct email/assignee-row check (see TaskDelegationNavContext), not a role_defaults gate — the
// dashboard tile is already hidden for anyone who fails both checks, so the "neither MD nor active
// assignee" branch below is a defensive fallback only (a stale tab / direct nav).
export default function TaskDelegationPanel() {
  const { isMD, isActiveAssignee, loading: navLoading } = useTaskDelegationNav()

  const [inited, setInited] = useState(false)
  const [assignees, setAssignees] = useState([])
  const [tasks, setTasks] = useState([])
  const [taskAssigneeMap, setTaskAssigneeMap] = useState(new Map())

  const [activeTab, setActiveTab] = useState('alltasks')
  const [filterAssignee, setFilterAssignee] = useState('')
  const [activeKpi, setActiveKpi] = useState(null) // MD's All Tasks KPI filter
  const [myActiveKpi, setMyActiveKpi] = useState(null) // assignee's My Tasks KPI filter

  const [assigneeModalOpen, setAssigneeModalOpen] = useState(false)
  const [taskModalState, setTaskModalState] = useState(null) // { editingId } | { editingId: null } | null
  const [detailTaskId, setDetailTaskId] = useState(null)

  async function loadAll() {
    if (isMD) {
      const [assigneeRows, taskRows, linkRows] = await Promise.all([fetchAssignees(), fetchAllTasksForMD(), fetchTaskAssigneeLinks()])
      setAssignees(assigneeRows)
      setTasks(taskRows)
      setTaskAssigneeMap(buildTaskAssigneeMap(linkRows))
    } else {
      setTasks(await fetchMyTasks())
    }
  }

  useEffect(() => {
    if (navLoading || inited) return
    if (!isMD && !isActiveAssignee) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot load gate, not a render loop
    setInited(true)
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot load, gated on the nav check resolving
  }, [navLoading, isMD, isActiveAssignee, inited])

  function patchTask(id, patch) {
    setTasks((prev) => prev.map((t) => (String(t.id) === String(id) ? { ...t, ...patch } : t)))
  }

  async function handleToggleAssigneeActive(id, isActive) {
    setAssignees((prev) => prev.map((a) => (a.id === id ? { ...a, is_active: isActive } : a)))
    try {
      await setAssigneeActive(id, isActive)
    } catch (e) {
      alert('❌ Failed to update assignee: ' + e.message)
      setAssignees((prev) => prev.map((a) => (a.id === id ? { ...a, is_active: !isActive } : a))) // revert on failure
    }
  }

  function handleAssigneeSaved(saved) {
    setAssignees((prev) => [...prev, saved])
    setAssigneeModalOpen(false)
  }

  function handleTaskSaved({ mode, taskId, task, payload, assigneeEmails }) {
    if (mode === 'edit') {
      patchTask(taskId, payload)
      setTaskAssigneeMap((prev) => new Map(prev).set(taskId, assigneeEmails))
    } else {
      setTasks((prev) => [task, ...prev])
      setTaskAssigneeMap((prev) => new Map(prev).set(task.id, assigneeEmails))
    }
    setTaskModalState(null)
  }

  if (navLoading) {
    return <div className="px-4 sm:px-6 py-10 text-center text-text-muted text-[13px]">⏳ Loading…</div>
  }

  if (!isMD && !isActiveAssignee) {
    return (
      <div className="px-4 sm:px-6 py-16 text-center text-text-muted text-[13px]">You don't have any delegated tasks yet.</div>
    )
  }

  return (
    <div className="px-4 sm:px-6 py-5">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div>
          <div className="text-[16px] font-semibold text-text">Task Delegation</div>
          <div className="text-[11.5px] text-text-muted mt-0.5">Home › Dashboards › Task Delegation</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadAll}
            className="text-[12px] font-medium text-primary border border-primary/30 rounded-md px-3 py-1.5"
          >
            🔄 Refresh
          </button>
          {isMD && (
            <>
              <button
                type="button"
                onClick={() => setAssigneeModalOpen(true)}
                className="text-[12px] font-semibold text-primary border border-primary/30 rounded-md px-3.5 py-1.5"
              >
                + Add Assignee
              </button>
              <button
                type="button"
                onClick={() => setTaskModalState({ editingId: null })}
                className="text-[12px] font-semibold text-white bg-primary rounded-md px-3.5 py-1.5"
              >
                + New Task
              </button>
            </>
          )}
        </div>
      </div>

      {isMD ? (
        <>
          <div className="flex gap-2 flex-wrap mb-4">
            {TABS.map(([id, label]) => (
              <TabButton key={id} active={activeTab === id} onClick={() => setActiveTab(id)}>
                {label}
              </TabButton>
            ))}
          </div>

          {activeTab === 'assignees' && <AssigneesTab assignees={assignees} onToggleActive={handleToggleAssigneeActive} />}
          {activeTab === 'alltasks' && (
            <AllTasksTab
              tasks={tasks}
              assignees={assignees}
              taskAssigneeMap={taskAssigneeMap}
              filterAssignee={filterAssignee}
              onFilterAssigneeChange={setFilterAssignee}
              activeKpi={activeKpi}
              onKpiClick={(id) => setActiveKpi((prev) => (id === 'all' || prev === id ? null : id))}
              onOpenTask={setDetailTaskId}
              onEditTask={(id) => setTaskModalState({ editingId: id })}
            />
          )}
        </>
      ) : (
        <MyTasksView
          tasks={tasks}
          activeKpi={myActiveKpi}
          onKpiClick={(id) => setMyActiveKpi((prev) => (id === 'all' || prev === id ? null : id))}
          onOpenTask={setDetailTaskId}
        />
      )}

      <AddAssigneeModal
        open={assigneeModalOpen}
        assignees={assignees}
        onClose={() => setAssigneeModalOpen(false)}
        onSaved={handleAssigneeSaved}
      />

      <TaskFormModal
        open={!!taskModalState}
        editingTask={taskModalState?.editingId ? tasks.find((t) => String(t.id) === String(taskModalState.editingId)) : null}
        assignees={assignees}
        taskAssigneeMap={taskAssigneeMap}
        onClose={() => setTaskModalState(null)}
        onSaved={handleTaskSaved}
      />

      <TaskDetailModal
        taskId={detailTaskId}
        tasks={tasks}
        assignees={assignees}
        taskAssigneeMap={taskAssigneeMap}
        isMdUser={isMD}
        onClose={() => setDetailTaskId(null)}
        onEdit={(id) => setTaskModalState({ editingId: id })}
        onTaskPatched={patchTask}
      />
    </div>
  )
}
