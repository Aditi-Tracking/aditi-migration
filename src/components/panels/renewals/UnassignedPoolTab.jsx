import { useEffect, useState } from 'react'
import { assignUnassignedCustomer, fetchCrmPersons, fetchUnassignedPool, groupUnassignedByCategory } from '../../../lib/renewals'

// Ported from old-portal/js/renewals.js's loadRenewalsUnassignedPool/
// ruRenderUnassignedPool/_ruUnassignedRowHtml/ruAssignUnassignedPool.
// MIS-only. Reports its own precise count up to RenewalsPanel on every load
// and every successful assign — the second half of the tab-button badge's
// two-tier behavior (see RenewalsPanel's cheap count-on-load/location-switch
// query, fetchUnassignedPoolCount).
export default function UnassignedPoolTab({ location, onCountChange }) {
  const [pool, setPool] = useState([])
  const [persons, setPersons] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fresh load triggered by a location change, not a synchronous render loop
    setLoading(true)
    setError('')
    Promise.all([fetchUnassignedPool(location), fetchCrmPersons(location)])
      .then(([rows, personsRows]) => {
        if (cancelled) return
        setPool(rows)
        setPersons(personsRows)
        onCountChange(rows.length)
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onCountChange is a stable setter passed down, only `location` should re-trigger the fetch
  }, [location])

  async function handleAssign(customerId, personId, selectEl) {
    if (!personId) return
    try {
      await assignUnassignedCustomer(customerId, personId)
      setPool((prev) => {
        const next = prev.filter((c) => c.id !== customerId)
        onCountChange(next.length)
        return next
      })
    } catch (e) {
      alert('❌ Could not assign: ' + e.message)
      selectEl.value = ''
    }
  }

  if (loading) return <p className="text-text-muted text-[13.5px]">Loading…</p>
  if (error) return <p className="text-danger text-[13.5px]">⚠️ {error}</p>

  const groups = groupUnassignedByCategory(pool)

  if (!groups.length) {
    return <p className="text-text-muted text-[13px]">No unassigned customers 🎉</p>
  }

  return (
    <div>
      {groups.map(({ category, freq, rows }) => (
        <div key={category ?? '__none__'} className="rounded-xl border border-border bg-surface mb-5 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border">
            <span className="text-[13px] font-semibold text-text">
              {category || 'No Category'} ({rows.length}){freq ? ` — ${freq}` : ''}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="border-collapse text-[12.5px] w-full">
              <thead>
                <tr className="bg-surface-2 text-text-muted text-left border-b border-border">
                  <th className="px-3 py-1.5">Billing Name</th>
                  <th className="px-3 py-1.5">City</th>
                  <th className="px-3 py-1.5">Contact Person</th>
                  <th className="px-3 py-1.5">Contact Number</th>
                  <th className="px-3 py-1.5">Category</th>
                  <th className="px-3 py-1.5 text-right">Grand Total</th>
                  <th className="px-3 py-1.5">Assign To</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-b border-border last:border-b-0">
                    <td className="px-3 py-1.5 text-text">{c.billing_name}</td>
                    <td className="px-3 py-1.5">{c.city || '—'}</td>
                    <td className="px-3 py-1.5">{c.contact_person || '—'}</td>
                    <td className="px-3 py-1.5">{c.contact_number || '—'}</td>
                    <td className="px-3 py-1.5">{c.category || '—'}</td>
                    <td className="px-3 py-1.5 text-right whitespace-nowrap">
                      {c._snapshot ? Number(c._snapshot.grand_total).toLocaleString('en-IN') : '—'}
                    </td>
                    <td className="px-3 py-1.5">
                      <select
                        defaultValue=""
                        onChange={(e) => handleAssign(c.id, e.target.value, e.target)}
                        className="max-w-[160px] rounded-md border border-border bg-surface-2 text-text text-[11.5px] px-1.5 py-1"
                      >
                        <option value="">Assign to…</option>
                        {persons.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}
