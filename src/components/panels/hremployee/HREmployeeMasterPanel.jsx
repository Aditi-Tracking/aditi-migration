import { useEffect, useState } from 'react'
import { useAuth } from '../../../context/AuthContext'
import { canEditHREmployee, canViewHREmployee, fetchAll } from '../../../lib/hrEmployee'
import OverviewTab from './OverviewTab'
import EmployeeListTab from './EmployeeListTab'
import ExitedStaffTab from './ExitedStaffTab'
import EmployeeFormModal from './EmployeeFormModal'
import ExitChecklistModal from './ExitChecklistModal'

const TABS = [
  ['overview', 'Overview'],
  ['list', 'Employee List'],
  ['exited', 'Exited Staff'],
]

// Ported from old-portal/js/hrEmployee.js's loadHREmployeeMaster/heRenderTabBar/heSwitchTab.
export default function HREmployeeMasterPanel() {
  const { currentUser, permissions } = useAuth()
  const canView = canViewHREmployee(currentUser, permissions)
  const canEdit = canEditHREmployee(currentUser, permissions)

  const [activeTab, setActiveTab] = useState('overview')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [employees, setEmployees] = useState([])
  const [checklistItems, setChecklistItems] = useState([])
  const [exitDetailsByEmployeeId, setExitDetailsByEmployeeId] = useState({})
  const [checklistStatusAll, setChecklistStatusAll] = useState([])

  const [formModal, setFormModal] = useState(null) // { employee: {...} | null } | null
  const [checklistEmployee, setChecklistEmployee] = useState(null)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const data = await fetchAll()
      setEmployees(data.employees)
      setChecklistItems(data.checklistItems)
      setExitDetailsByEmployeeId(data.exitDetailsByEmployeeId)
      setChecklistStatusAll(data.checklistStatusAll)
    } catch (e) {
      setError('Failed to load HR Employee Master data: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!canView) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-time fetch, gated on view access
    load()
  }, [canView])

  function handleOpenEmployee(id) {
    const employee = employees.find((e) => e.id === id) || null
    setFormModal({ employee })
  }

  async function handleFormSaved() {
    setFormModal(null)
    await load()
  }

  function handleOpenChecklist(id) {
    const employee = employees.find((e) => e.id === id)
    if (employee) setChecklistEmployee(employee)
  }

  function handleDataRefreshed({ exitDetailsByEmployeeId: fresh, checklistStatusAll: freshStatus }) {
    setExitDetailsByEmployeeId(fresh)
    setChecklistStatusAll(freshStatus)
  }

  if (!canView) {
    return <div className="px-4 sm:px-6 py-16 text-center text-text-muted text-[13px]">You don't have access to this dashboard.</div>
  }

  const editingExitDetail = formModal?.employee ? exitDetailsByEmployeeId[formModal.employee.id] : null

  return (
    <div className="px-4 sm:px-6 py-5">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div>
          <div className="text-[16px] font-semibold text-text">HR Employee Master</div>
          <div className="text-[11.5px] text-text-muted mt-0.5">Home › Dashboards › HR Employee Master</div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={load} className="text-[12px] font-medium text-primary border border-primary/30 rounded-md px-3 py-1.5">
            🔄 Refresh
          </button>
          {canEdit && (
            <button type="button" onClick={() => setFormModal({ employee: null })} className="text-[12px] font-semibold text-white bg-primary rounded-md px-3.5 py-1.5">
              + Add Employee
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-2 flex-wrap mb-4">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`rounded-lg px-4 py-1.5 text-[12.5px] font-semibold border ${
              activeTab === id ? 'bg-primary text-white border-primary' : 'bg-surface-2 text-text-muted border-border'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && <div className="text-center py-16 text-text-muted text-[13px]">⏳ Loading…</div>}
      {!loading && error && <div className="text-center py-16 text-danger text-[13px]">⚠️ {error}</div>}

      {!loading && !error && (
        <>
          {activeTab === 'overview' && (
            <OverviewTab
              employees={employees}
              exitDetailsByEmployeeId={exitDetailsByEmployeeId}
              checklistStatusAll={checklistStatusAll}
              checklistItemsLength={checklistItems.length}
              onOpenChecklist={handleOpenChecklist}
            />
          )}
          {activeTab === 'list' && <EmployeeListTab employees={employees} onOpenEmployee={handleOpenEmployee} />}
          {activeTab === 'exited' && (
            <ExitedStaffTab employees={employees} checklistStatusAll={checklistStatusAll} checklistItemsLength={checklistItems.length} onOpenChecklist={handleOpenChecklist} />
          )}
        </>
      )}

      <EmployeeFormModal
        open={!!formModal}
        employee={formModal?.employee || null}
        exitDetail={editingExitDetail}
        canEdit={canEdit}
        checklistItems={checklistItems}
        onClose={() => setFormModal(null)}
        onSaved={handleFormSaved}
      />

      <ExitChecklistModal
        employee={checklistEmployee}
        checklistItems={checklistItems}
        checklistStatusAll={checklistStatusAll}
        canEdit={canEdit}
        onClose={() => setChecklistEmployee(null)}
        onChecklistStatusChange={setChecklistStatusAll}
        onDataRefreshed={handleDataRefreshed}
      />
    </div>
  )
}
