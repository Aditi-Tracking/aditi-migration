import { useMemo, useState } from 'react'
import Table from '../../shared/table/Table'
import TableHead from '../../shared/table/TableHead'
import Th from '../../shared/table/Th'
import Td from '../../shared/table/Td'
import Tr from '../../shared/table/Tr'
import StatusBadge from '../../shared/table/StatusBadge'

const STATUS_TONE = { Submitted: '#16A34A', Pipeline: '#F0A500', 'Not Submitted': '#DC2626' }

// Not part of the reference mockup (which only shows the KPI row + the two summary tables) — added
// as the drill-down detail list every other dashboard in this app has, so a specific tender can
// actually be found rather than only seen as a tally.
export default function TenderExplorerTable({ rows }) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (statusFilter && r.status !== statusFilter) return false
      if (!q) return true
      return r.client.toLowerCase().includes(q) || r.title.toLowerCase().includes(q) || r.tenderId.toLowerCase().includes(q) || r.location.toLowerCase().includes(q)
    })
  }, [rows, search, statusFilter])

  return (
    <Table title="Tender Explorer" count={filtered.length} countLabel="tender">
      <div className="flex flex-wrap gap-2.5 items-center px-4 py-3 border-b border-border">
        <input
          type="text"
          placeholder="🔍 Search client, tender ID, title, location…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] bg-surface border border-border rounded-md px-3 py-1.5 text-[12.5px] text-text"
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="bg-surface border border-border rounded-md px-3 py-1.5 text-[12.5px] text-text">
          <option value="">All Status</option>
          <option value="Submitted">Submitted</option>
          <option value="Pipeline">In Pipeline</option>
          <option value="Not Submitted">Not Submitted</option>
        </select>
      </div>
      <TableHead>
        <Th>Client</Th>
        <Th>Tender ID</Th>
        <Th>Title</Th>
        <Th>Location</Th>
        <Th>Due Date</Th>
        <Th>Status</Th>
        <Th>Stage / Notes</Th>
      </TableHead>
      <tbody>
        {!filtered.length && (
          <tr>
            <Td colSpan={7} align="center" className="py-10 text-text-muted">
              No tenders found
            </Td>
          </tr>
        )}
        {filtered.map((r, i) => (
          <Tr key={`${r.tenderId}-${i}`}>
            <Td className="font-semibold text-text max-w-[180px] truncate" title={r.client}>
              {r.client || '—'}
            </Td>
            <Td className="text-text-muted whitespace-nowrap">{r.tenderId || '—'}</Td>
            <Td className="text-text-muted max-w-[260px] truncate" title={r.title}>
              {r.title || '—'}
            </Td>
            <Td className="text-text-muted">{r.location || '—'}</Td>
            <Td className="text-text-muted whitespace-nowrap">{r.dueDateRaw || '—'}</Td>
            <Td>
              <StatusBadge color={STATUS_TONE[r.status]}>{r.status}</StatusBadge>
            </Td>
            <Td className="text-text-muted max-w-[220px] truncate" title={r.stage}>
              {r.stage || '—'}
            </Td>
          </Tr>
        ))}
      </tbody>
    </Table>
  )
}
