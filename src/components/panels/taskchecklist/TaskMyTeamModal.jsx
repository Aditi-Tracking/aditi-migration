import { useEffect, useMemo, useState } from 'react'
import OverlayShell from '../../shared/OverlayShell'
import { computeKpiSummary, fetchMyTeamRows, fmtDate, fmtDateTime, hasAttachment, isDone, isOngoing, MY_TEAM_MEMBER_NAMES, scoreColor } from '../../../lib/taskChecklist'
import Table from '../../shared/table/Table'
import TableHead from '../../shared/table/TableHead'
import Th from '../../shared/table/Th'
import Td from '../../shared/table/Td'
import Tr from '../../shared/table/Tr'
import StatusBadge from '../../shared/table/StatusBadge'

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

const OVERALL = 'Overall'

function rowStatus(r) {
  if (isDone(r)) return { label: 'Done', tone: 'success' }
  if (isOngoing(r)) return { label: 'Ongoing', tone: 'warning' }
  return { label: 'Pending', tone: 'neutral' }
}

// Ashish-only (see lib/taskChecklist.js's canViewMyTeam) — a combined, READ-ONLY look at 4 named
// teammates' checklists. Deliberately not reusing TaskTable: that component's mark-done/undo/
// ongoing actions are always on regardless of canDelete (only bulk delete is gated), which would
// let Ashish edit someone else's checklist from a view meant only to show it to him.
export default function TaskMyTeamModal({ open, onClose }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rows, setRows] = useState([])
  const [dateFrom, setDateFrom] = useState(todayISO())
  const [dateTo, setDateTo] = useState(todayISO())
  const [activePerson, setActivePerson] = useState(OVERALL)

  function load(df, dt) {
    setLoading(true)
    setError('')
    fetchMyTeamRows({ dateFrom: df, dateTo: dt })
      .then(setRows)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (!open) return
    const t = todayISO()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset fresh each time the modal opens
    setDateFrom(t)
    setDateTo(t)
    setActivePerson(OVERALL)
    load(t, t)
  }, [open])

  function handleDateChange(setter, df, dt) {
    setter(df)
    load(df, dt)
  }

  const countsByPerson = useMemo(() => {
    const counts = Object.fromEntries(MY_TEAM_MEMBER_NAMES.map((n) => [n, 0]))
    rows.forEach((r) => {
      const n = MY_TEAM_MEMBER_NAMES.find((name) => name.toLowerCase() === String(r.name || '').trim().toLowerCase())
      if (n) counts[n]++
    })
    return counts
  }, [rows])

  const personRows = useMemo(
    () => (activePerson === OVERALL ? rows : rows.filter((r) => String(r.name || '').trim().toLowerCase() === activePerson.toLowerCase())),
    [rows, activePerson]
  )
  const summary = computeKpiSummary(personRows, { dateFrom, dateTo })

  if (!open) return null

  return (
    <OverlayShell open={open} onClose={onClose} maxWidth="max-w-3xl">
      <div className="text-[15px] font-semibold text-text mb-3 pr-8">👥 My Team</div>

      <div className="flex flex-wrap gap-2 mb-4">
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => handleDateChange(setDateFrom, e.target.value, dateTo)}
          className="rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-[12px] text-text outline-none"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => handleDateChange(setDateTo, dateFrom, e.target.value)}
          className="rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-[12px] text-text outline-none"
        />
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <button
          type="button"
          onClick={() => setActivePerson(OVERALL)}
          className={`text-[12.5px] font-bold rounded-md px-3 py-1.5 border ${
            activePerson === OVERALL ? 'bg-primary text-white border-primary' : 'border-border text-text-muted'
          }`}
        >
          Overall <span className="opacity-70">({rows.length})</span>
        </button>
        {MY_TEAM_MEMBER_NAMES.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => setActivePerson(name)}
            className={`text-[12.5px] font-medium rounded-md px-3 py-1.5 border ${
              activePerson === name ? 'bg-primary text-white border-primary' : 'border-border text-text-muted'
            }`}
          >
            {name} <span className="opacity-70">({countsByPerson[name] || 0})</span>
          </button>
        ))}
      </div>

      {!loading && !error && (
        <div className="flex flex-wrap gap-4 mb-4 text-[12px] text-text-muted">
          <span>
            Total: <strong className="text-text">{summary.total}</strong>
          </span>
          <span>
            Done: <strong className="text-[#15803d]">{summary.done}</strong>
          </span>
          <span>
            Pending: <strong className="text-[#b91c1c]">{summary.pending}</strong>
          </span>
          <span>
            Ongoing: <strong className="text-[#b45309]">{summary.ongoingCount}</strong>
          </span>
          <span>
            Score: <strong style={{ color: scoreColor(summary.score) }}>{summary.score}%</strong>
          </span>
        </div>
      )}

      {loading && <div className="text-center py-10 text-text-muted text-[12.5px]">⏳ Loading…</div>}
      {!loading && error && <div className="text-center py-10 text-danger text-[12.5px]">❌ {error}</div>}

      {!loading && !error && (
        <div className="max-h-[50vh] overflow-y-auto">
          <Table>
            <TableHead>
              {activePerson === OVERALL && <Th>Person</Th>}
              <Th>Task</Th>
              <Th>Planned</Th>
              <Th>Status</Th>
              <Th>Completed</Th>
              <Th>Remarks</Th>
            </TableHead>
            <tbody>
              {!personRows.length && (
                <tr>
                  <Td colSpan={activePerson === OVERALL ? 6 : 5} align="center" className="py-10 text-text-muted">
                    No tasks found for {activePerson} in this date range
                  </Td>
                </tr>
              )}
              {personRows.map((r) => {
                const st = rowStatus(r)
                return (
                  <Tr key={r.id}>
                    {activePerson === OVERALL && <Td className="text-text-muted whitespace-nowrap">{r.name}</Td>}
                    <Td className="font-medium text-text max-w-[220px] truncate" title={r.task}>
                      {r.task}
                      {hasAttachment(r) && <span className="ml-1.5 text-text-muted">📎</span>}
                    </Td>
                    <Td className="text-text-muted whitespace-nowrap">{fmtDate(r.plannedRaw)}</Td>
                    <Td>
                      <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
                    </Td>
                    <Td className="text-text-muted whitespace-nowrap">{r.actual ? fmtDateTime(r.actual) : '—'}</Td>
                    <Td className="text-text-muted max-w-[180px] truncate" title={r.remarks}>
                      {r.remarks || '—'}
                    </Td>
                  </Tr>
                )
              })}
            </tbody>
          </Table>
        </div>
      )}
    </OverlayShell>
  )
}
