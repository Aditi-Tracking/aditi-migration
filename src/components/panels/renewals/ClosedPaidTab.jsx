import { useEffect, useState } from 'react'
import { assignedPersonName, fetchClosedPaid, fetchCrmPersons, filterBySearch, groupClosedPaidByCategory } from '../../../lib/renewals'

// Ported from old-portal/js/renewals.js's loadRenewalsClosedPaid/
// ruRenderClosedPaid. Read-only — no Call/Reassign here, there's nothing to
// call about and reassigning a paid-off customer isn't a real workflow.
// Search is a real filtered React array (same idiomatic-state technique
// already used for My Customers), not production's DOM-class row-hiding.
export default function ClosedPaidTab({ location, isMIS, fullDataAccess, crmPerson }) {
  const crmPersonId = crmPerson?.id || null

  const [customers, setCustomers] = useState([])
  const [persons, setPersons] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fresh load triggered by a location/scope change, not a synchronous render loop
    setLoading(true)
    setError('')
    Promise.all([fetchClosedPaid({ location, isMIS, fullDataAccess, crmPersonId }), fetchCrmPersons(location)])
      .then(([rows, personsRows]) => {
        if (cancelled) return
        setCustomers(rows)
        setPersons(personsRows)
        setSearch('')
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [location, isMIS, fullDataAccess, crmPersonId])

  if (loading) return <p className="text-text-muted text-[13.5px]">Loading…</p>
  if (error) return <p className="text-danger text-[13.5px]">⚠️ {error}</p>

  const visible = filterBySearch(customers, search)
  const groups = groupClosedPaidByCategory(visible)
  const showAssignedTo = isMIS || fullDataAccess

  return (
    <div>
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="🔍 Search billing name..."
        className="rounded-lg border border-border bg-surface-2 text-text px-3 py-1.5 text-[12.5px] outline-none mb-3.5"
      />

      {groups.length ? (
        groups.map(({ category, rows }) => (
          <div key={category} className="rounded-xl border border-border bg-surface mb-5 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border">
              <span className="text-[13px] font-semibold text-text">
                {category} ({rows.length})
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="border-collapse text-[12.5px] w-full">
                <thead>
                  <tr className="bg-surface-2 text-text-muted text-left border-b border-border">
                    <th className="px-3 py-1.5">Billing Name</th>
                    <th className="px-3 py-1.5">Category</th>
                    <th className="px-3 py-1.5 text-right">Last Outstanding</th>
                    <th className="px-3 py-1.5">Date Closed/Paid</th>
                    {showAssignedTo && <th className="px-3 py-1.5">Assigned To</th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.id} className="border-b border-border last:border-b-0">
                      <td className="px-3 py-1.5 text-text">{c.billing_name}</td>
                      <td className="px-3 py-1.5">{c.category || '—'}</td>
                      <td className="px-3 py-1.5 text-right whitespace-nowrap">
                        {c._priorOutstanding !== null ? Number(c._priorOutstanding).toLocaleString('en-IN') : '—'}
                      </td>
                      <td className="px-3 py-1.5 whitespace-nowrap">{c._closedDate || '—'}</td>
                      {showAssignedTo && <td className="px-3 py-1.5">{assignedPersonName(c, persons) || '— Unassigned —'}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      ) : (
        <p className="text-text-muted text-[13px]">No closed/paid customers.</p>
      )}
    </div>
  )
}
