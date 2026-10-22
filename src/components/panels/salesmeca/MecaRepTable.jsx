import { MECA_SORT_KINDS, cellBands, sortReps } from '../../../lib/salesMeca'
import Table from '../../shared/table/Table'
import TableHead from '../../shared/table/TableHead'
import Th from '../../shared/table/Th'
import Td from '../../shared/table/Td'
import Tr from '../../shared/table/Tr'
import StatusBadge from '../../shared/table/StatusBadge'
import ColumnFilter from '../../shared/table/ColumnFilter'
import MetricCells from './MetricCells'
import { MECA_COL, METRIC_COLUMNS } from './mecaColumns'

// The one table of Sales Rep MeCa: one fixed-height row per rep for the whole selected period; for an admin the company Total is pinned above
// them (it never moves with the sort — click it for the company's periods) and the Unmapped / Unassigned rows — numbers that belong to a Sales
// Person name nobody has linked to an employee yet — stay at the bottom. A rep sees only their own row. Every column sorts. Clicking a row opens
// that rep's detail (period breakdown + the leads behind the numbers). Turnover and % of target are coloured against the rep's own target;
// Avg Rs Sale and Conversion against the company figure (admin only — a rep has no company figure to compare with).
// Props: report (lib/salesMeca.js buildReport), isAll, sort ({ key, dir } | null), onSort(key, dir), onOpen(rep), onOpenCompany()
const COLUMNS = [
  ['meetings', 'Meetings', MECA_COL.count, 'right'],
  ['clients', 'Clients', MECA_COL.count, 'right'],
  ['conversion', 'Conversion', MECA_COL.pct, 'right'],
  ['turnover', 'Turnover', MECA_COL.money, 'right'],
  ['avgSale', 'Avg Rs Sale', MECA_COL.money, 'right'],
  ['target', 'Target', MECA_COL.target, 'right'],
  ['pct', '% of target', MECA_COL.pct, 'right'],
  ['gap', 'Gap', MECA_COL.money, 'right'],
]

export default function MecaRepTable({ report, isAll, sort, onSort, onOpen, onOpenCompany }) {
  const rows = sortReps(report.reps, sort)
  const sortOnly = (key, label) => <ColumnFilter label={label} kind="none" sort={{ kind: MECA_SORT_KINDS[key], current: sort?.key === key ? sort.dir : null, onSort: (dir) => onSort(key, dir) }} />

  return (
    <Table title={isAll ? 'Sales reps' : 'Your results'} count={report.reps.length} countLabel="rep">
      <TableHead>
        <Th className={MECA_COL.name} filter={sortOnly('name', 'Rep')}>
          Rep
        </Th>
        {COLUMNS.map(([key, label, width, align]) => (
          <Th key={key} className={width} align={align} filter={sortOnly(key, label)}>
            {label}
          </Th>
        ))}
      </TableHead>
      <tbody>
        {isAll && (
          <Tr zebra={false} onClick={onOpenCompany} title="Click to see the company's periods" className="h-9 bg-primary-tint/50">
            <Td className={`${MECA_COL.name} font-bold text-text`}>Company total</Td>
            <MetricCells cell={report.company.total} perRep={false} strong />
          </Tr>
        )}
        {!rows.length ? (
          <tr>
            <Td colSpan={METRIC_COLUMNS + 1} align="center" className="py-10 text-text-muted">
              {isAll ? 'No sales activity in this period, and no sales people linked yet.' : 'No sales activity in this period.'}
            </Td>
          </tr>
        ) : (
          rows.map((r) => (
            <Tr key={r.key} onClick={() => onOpen(r)} title="Click to see this rep's periods and leads" className="h-9">
              <Td className={`${MECA_COL.name} truncate font-semibold text-text`} title={r.unmapped ? `${r.name} — no employee is linked to this Sales Person name yet (link it under Set up)` : `${r.name} (${r.email})`}>
                {r.unmapped ? (
                  <span className="inline-flex items-center gap-2 min-w-0">
                    <StatusBadge tone="warning">Unmapped</StatusBadge>
                    <span className="truncate">{r.name.replace(/^Unmapped: /, '')}</span>
                  </span>
                ) : (
                  r.name
                )}
              </Td>
              <MetricCells cell={r.total} bands={r.unmapped ? null : cellBands(r.total, isAll ? report.company.total : null)} />
            </Tr>
          ))
        )}
      </tbody>
    </Table>
  )
}
