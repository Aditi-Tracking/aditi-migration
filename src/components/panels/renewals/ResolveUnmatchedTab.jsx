import { useEffect, useState } from 'react'
import {
  RU_CATEGORY_FREQ,
  fetchCrmPersons,
  fetchLatestUnmatchedBatchDate,
  fetchUnmatchedNames,
  filterBySearch,
  resolveUnmatchedCustomer,
  sweepUnmatchedDuplicates,
} from '../../../lib/renewals'

const CATEGORY_OPTIONS = Object.keys(RU_CATEGORY_FREQ)

// Ported from old-portal/js/renewals.js's loadRenewalsUnmatched/
// ruRenderUnmatched/ruAssign/_ruSweepUnmatchedDuplicates. "Latest batch
// only": the most recent import_batch_date for this location is looked up
// first, then the main list is filtered to just that date — a name that
// went unresolved in an older upload and never reappeared is stale backlog,
// not this period's real unmatched set.
export default function ResolveUnmatchedTab({ location }) {
  const [rows, setRows] = useState([])
  const [persons, setPersons] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [selections, setSelections] = useState({}) // { [rowId]: { personId, category } }

  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fresh load triggered by a location change, not a synchronous render loop
    setLoading(true)
    setError('')
    async function load() {
      try {
        const latestBatchDate = await fetchLatestUnmatchedBatchDate(location)
        const [personsRows, unmatchedRows] = await Promise.all([
          fetchCrmPersons(location),
          fetchUnmatchedNames({ location, latestBatchDate }),
        ])
        if (cancelled) return
        setPersons(personsRows)
        setRows(unmatchedRows)
        setSearch('')
        setSelections({})
      } catch (e) {
        if (!cancelled) setError(e.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [location])

  function setSelection(rowId, field, value) {
    setSelections((prev) => ({ ...prev, [rowId]: { ...prev[rowId], [field]: value } }))
  }

  async function handleAssign(row) {
    const sel = selections[row.id] || {}
    if (!sel.personId) {
      alert('⚠️ Please select a person to assign.')
      return
    }
    if (!sel.category) {
      alert('⚠️ Please select a category.')
      return
    }
    try {
      const newCustomerId = await resolveUnmatchedCustomer({ unmatchedId: row.id, personId: sel.personId, category: sel.category })
      // Best-effort — never surfaced as an error even if it fails, the
      // primary assign has already succeeded.
      await sweepUnmatchedDuplicates({ rawName: row.raw_name, location: row.location, resolvedCustomerId: newCustomerId })
      setRows((prev) => prev.filter((r) => r.id !== row.id))
    } catch (e) {
      alert('❌ Could not assign: ' + e.message)
    }
  }

  if (loading) return <p className="text-text-muted text-[13.5px]">Loading…</p>
  if (error) return <p className="text-danger text-[13.5px]">⚠️ {error}</p>

  const visible = filterBySearch(rows, search, 'raw_name')

  return (
    <div>
      <div className="flex items-center justify-between gap-2.5 flex-wrap mb-3.5">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Search raw name..."
          className="rounded-lg border border-border bg-surface-2 text-text px-3 py-1.5 text-[12.5px] outline-none"
        />
        <span className="rounded-full border border-danger/30 bg-danger-tint text-danger font-bold text-[12.5px] px-3.5 py-1">
          {rows.length} unresolved
        </span>
      </div>

      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="border-collapse text-[12.5px] w-full">
            <thead>
              <tr className="bg-surface-2 text-text-muted text-left border-b border-border">
                <th className="px-3 py-1.5">Raw Name</th>
                <th className="px-3 py-1.5 text-right">Grand Total</th>
                <th className="px-3 py-1.5 text-right">0-30</th>
                <th className="px-3 py-1.5 text-right">31-60</th>
                <th className="px-3 py-1.5 text-right">61-90</th>
                <th className="px-3 py-1.5 text-right">Above 90</th>
                <th className="px-3 py-1.5">Batch Date</th>
                <th className="px-3 py-1.5">Assign To</th>
                <th className="px-3 py-1.5">Category</th>
                <th className="px-3 py-1.5 text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {!rows.length ? (
                <tr>
                  <td colSpan={10} className="px-3 py-3 text-text-muted">
                    Nothing to resolve 🎉
                  </td>
                </tr>
              ) : (
                visible.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-b-0">
                    <td className="px-3 py-1.5 text-text max-w-[180px] truncate" title={r.raw_name}>
                      {r.raw_name}
                    </td>
                    <td className="px-3 py-1.5 text-right whitespace-nowrap">{Number(r.grand_total || 0).toLocaleString('en-IN')}</td>
                    <td className="px-3 py-1.5 text-right whitespace-nowrap">{Number(r.bucket_0_30 || 0).toLocaleString('en-IN')}</td>
                    <td className="px-3 py-1.5 text-right whitespace-nowrap">{Number(r.bucket_31_60 || 0).toLocaleString('en-IN')}</td>
                    <td className="px-3 py-1.5 text-right whitespace-nowrap">{Number(r.bucket_61_90 || 0).toLocaleString('en-IN')}</td>
                    <td className="px-3 py-1.5 text-right whitespace-nowrap">{Number(r.bucket_above_90 || 0).toLocaleString('en-IN')}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{r.import_batch_date || '—'}</td>
                    <td className="px-3 py-1.5">
                      <select
                        value={selections[r.id]?.personId || ''}
                        onChange={(e) => setSelection(r.id, 'personId', e.target.value)}
                        className="rounded-md border border-border bg-surface-2 text-text text-[11.5px] px-1.5 py-1 w-full"
                      >
                        <option value="">Select person…</option>
                        {persons.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-1.5">
                      <select
                        value={selections[r.id]?.category || ''}
                        onChange={(e) => setSelection(r.id, 'category', e.target.value)}
                        className="rounded-md border border-border bg-surface-2 text-text text-[11.5px] px-1.5 py-1 w-full"
                      >
                        <option value="">Select…</option>
                        {CATEGORY_OPTIONS.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-1.5 text-center whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleAssign(r)}
                        className="rounded-lg border border-primary/40 bg-primary-tint text-primary font-bold text-[11.5px] px-2.5 py-1"
                      >
                        Assign
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
