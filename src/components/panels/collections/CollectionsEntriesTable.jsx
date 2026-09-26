import { COLLECTIONS_PAGE_SIZE } from '../../../lib/collectionsDashboard'
import TopPagination from '../../shared/table/TopPagination'

const INR = (n) => `₹${Math.round(n).toLocaleString('en-IN')}`

const COLUMNS = ['Date', 'Location', 'Employee', 'Call Commitment', 'Call Done', 'Commitment', 'Repeat Orders', 'Outstanding', 'Total', 'MTD', 'Remark']

// Client-side paginated table — the full dataset (~750 rows across 4 months) is already in
// memory from the one-shot fetch, unlike Field Service Dashboard's server-paginated entries.
export default function CollectionsEntriesTable({ rows, page, onPageChange }) {
  const total = rows.length
  const start = page * COLLECTIONS_PAGE_SIZE
  const pageRows = rows.slice(start, start + COLLECTIONS_PAGE_SIZE)

  return (
    <div className="rounded-xl border border-border bg-surface p-3.5">
      <div className="flex items-center justify-between mb-2.5">
        <div className="text-[14px] font-semibold text-text">Entries</div>
        <TopPagination page={page} pageSize={COLLECTIONS_PAGE_SIZE} total={total} onPageChange={onPageChange} zeroIndexed />
      </div>

      {!rows.length && <div className="text-center py-10 text-text-muted text-[14px]">No entries found.</div>}

      {!!rows.length && (
        <div className="overflow-x-auto">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="border-b-2 border-border">
                {COLUMNS.map((label) => (
                  <th key={label} className="px-2.5 py-2 text-[11.5px] font-bold uppercase tracking-wide text-text-muted whitespace-nowrap text-center">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r, i) => (
                <tr key={`${r.name}-${r.dateStr}-${i}`} className="border-b border-border last:border-0 hover:bg-surface-2">
                  <td className="px-2.5 py-2 whitespace-nowrap text-center">{r.dateStr}</td>
                  <td className="px-2.5 py-2 whitespace-nowrap text-center">{r.location}</td>
                  <td className="px-2.5 py-2 whitespace-nowrap text-center">{r.name}</td>
                  <td className="px-2.5 py-2 text-center">{r.commitmentCalls.toLocaleString('en-IN')}</td>
                  <td className="px-2.5 py-2 text-center">{r.connectCall.toLocaleString('en-IN')}</td>
                  <td className="px-2.5 py-2 text-center">{INR(r.commitment)}</td>
                  <td className="px-2.5 py-2 text-center">{INR(r.resale)}</td>
                  <td className="px-2.5 py-2 text-center">{INR(r.outstanding)}</td>
                  <td className="px-2.5 py-2 text-center font-semibold text-text">{INR(r.total)}</td>
                  <td className="px-2.5 py-2 text-center text-text-muted">{INR(r.mtd)}</td>
                  <td className="px-2.5 py-2 whitespace-nowrap text-center">{r.remark}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
