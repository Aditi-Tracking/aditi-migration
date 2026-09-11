import { useMemo } from 'react'
import { isDone } from '../../../lib/taskChecklist'

const MEDALS = ['🥇', '🥈', '🥉']

// Ported from old-portal/js/tasks.js's tRenderCharts' leaderboard section
// (rendered as part of the same function upstream, split into its own
// component here). Sorted by Done count descending.
export default function TaskLeaderboard({ data, activePerson, onRowClick }) {
  const rows = useMemo(() => {
    const map = data.reduce((acc, r) => {
      const n = r.name || ''
      if (!n) return acc
      if (!acc[n]) acc[n] = { name: n, dept: r.department || '', total: 0, done: 0, pending: 0 }
      acc[n].total++
      if (isDone(r)) acc[n].done++
      else acc[n].pending++
      return acc
    }, {})
    return Object.values(map).sort((a, b) => b.done - a.done)
  }, [data])

  return (
    <div className="rounded-xl border border-border bg-surface p-3.5 mb-4 max-h-[300px] overflow-y-auto">
      <table className="w-full text-[12.5px] border-collapse">
        <thead>
          <tr className="text-text-muted border-b border-border">
            <th className="text-left px-2 py-1.5">#</th>
            <th className="text-left px-2 py-1.5">Name</th>
            <th className="text-left px-2 py-1.5">Department</th>
            <th className="text-center px-2 py-1.5">Total</th>
            <th className="text-center px-2 py-1.5 text-primary">Done</th>
            <th className="text-center px-2 py-1.5 text-danger">Pending</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={r.name}
              onClick={() => onRowClick(r.name)}
              className="border-b border-border last:border-b-0 cursor-pointer hover:bg-surface-2"
            >
              <td className="px-2 py-1.5">{MEDALS[i] || i + 1}</td>
              <td className={`px-2 py-1.5 font-semibold ${activePerson === r.name ? 'text-primary' : 'text-text'}`}>{r.name}</td>
              <td className="px-2 py-1.5">
                <span className="text-[11px] bg-primary-tint text-primary rounded px-1.5 py-0.5">{r.dept || '—'}</span>
              </td>
              <td className="text-center px-2 py-1.5">{r.total}</td>
              <td className="text-center px-2 py-1.5 font-semibold text-primary">{r.done}</td>
              <td className="text-center px-2 py-1.5 font-semibold text-danger">{r.pending}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
