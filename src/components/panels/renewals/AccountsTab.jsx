import { useEffect, useState } from 'react'
import {
  accountsPersonNameByEmail,
  fetchAccountsFlaggedCustomers,
  fetchAccountsPersons,
  fetchEmployeeNamesByEmail,
  locationLabel,
} from '../../../lib/renewals'
import AccountsDetailModal from './AccountsDetailModal'

const STATUS_OPTIONS = [
  ['open', 'Open'],
  ['resolved', 'Resolved'],
  ['all', 'All'],
]

// Ported from old-portal/js/renewals.js's loadRenewalsAccounts/
// _ruRenderAccountsTab/_ruAccountsRowHtml. Deliberately location-agnostic —
// the one exception to every other tab's per-loader location scoping
// (Accounts is one central team, not scoped to a region the way a CRM
// person is). The shared location bar above this tab is NOT suppressed
// (unlike Overview) — it stays switchable but has zero effect on what's
// shown here, matching production's own gap rather than silently fixing it.
export default function AccountsTab({ isMIS, isAccounts }) {
  const [statusFilter, setStatusFilter] = useState('all')
  const [customers, setCustomers] = useState([])
  const [personsByEmail, setPersonsByEmail] = useState({})
  const [personsById, setPersonsById] = useState({})
  const [employeesByEmail, setEmployeesByEmail] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [detailId, setDetailId] = useState(null)

  function load() {
    let cancelled = false
    setLoading(true)
    setError('')
    Promise.all([fetchAccountsFlaggedCustomers(statusFilter), fetchAccountsPersons(), fetchEmployeeNamesByEmail()])
      .then(([rows, persons, employees]) => {
        if (cancelled) return
        setCustomers(rows)
        const byEmail = {}
        const byId = {}
        persons.forEach((p) => {
          byId[p.id] = p.name
          if (p.email) byEmail[String(p.email).toLowerCase()] = p.name
        })
        setPersonsByEmail(byEmail)
        setPersonsById(byId)
        setEmployeesByEmail(employees)
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fresh load triggered by a status-filter change, not a synchronous render loop
    return load()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load() closes over statusFilter, already the dep below
  }, [statusFilter])

  function resolveAuthorName(email) {
    return accountsPersonNameByEmail(email, personsByEmail, employeesByEmail)
  }

  const detailCustomer = customers.find((c) => c.id === detailId) || null

  return (
    <div>
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border flex items-center justify-between flex-wrap gap-2.5">
          <span className="text-[13px] font-semibold text-text">Flagged Customers ({customers.length})</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md border border-border bg-surface-2 text-text text-[12px] font-bold px-2.5 py-1.5"
          >
            {STATUS_OPTIONS.map(([v, label]) => (
              <option key={v} value={v}>
                Status: {label}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <p className="px-4 py-3.5 text-text-muted text-[12.5px]">Loading…</p>
        ) : error ? (
          <p className="px-4 py-3.5 text-danger text-[12.5px]">⚠️ {error}</p>
        ) : !customers.length ? (
          <p className="px-4 py-3.5 text-text-muted text-[12.5px]">
            {statusFilter === 'resolved' ? 'No resolved flags yet.' : statusFilter === 'all' ? 'No flagged customers yet.' : 'No open flags 🎉'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="border-collapse text-[12.5px] w-full">
              <thead>
                <tr className="bg-surface-2 text-text-muted text-left border-b border-border">
                  <th className="px-3 py-1.5">Customer</th>
                  <th className="px-3 py-1.5">Location</th>
                  <th className="px-3 py-1.5 text-right">Outstanding</th>
                  <th className="px-3 py-1.5">Flagged By</th>
                  <th className="px-3 py-1.5">Status</th>
                  <th className="px-3 py-1.5">Resolved By</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => {
                  const isOpen = c.accounts_flag_status === 'open'
                  const grandTotal = c._snapshot ? Number(c._snapshot.grand_total).toLocaleString('en-IN') : '—'
                  return (
                    <tr
                      key={c.id}
                      onClick={() => setDetailId(c.id)}
                      className="border-b border-border last:border-b-0 cursor-pointer hover:bg-surface-2/60"
                    >
                      <td className="px-3 py-1.5 text-text">{c.billing_name}</td>
                      <td className="px-3 py-1.5">{locationLabel(c.location)}</td>
                      <td className="px-3 py-1.5 text-right whitespace-nowrap">{grandTotal}</td>
                      <td className="px-3 py-1.5">{resolveAuthorName(c.accounts_flagged_by)}</td>
                      <td className="px-3 py-1.5">
                        <span
                          className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                            isOpen ? 'border-[#f0a50055] bg-[#f0a50018] text-[#f0a500]' : 'border-primary/30 bg-primary-tint text-primary'
                          }`}
                        >
                          {isOpen ? 'Open' : 'Resolved'}
                        </span>
                      </td>
                      <td className="px-3 py-1.5">{!isOpen ? resolveAuthorName(c.accounts_resolved_by) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AccountsDetailModal
        open={!!detailId}
        customer={detailCustomer}
        personsById={personsById}
        resolveAuthorName={resolveAuthorName}
        isMIS={isMIS}
        isAccounts={isAccounts}
        onClose={() => setDetailId(null)}
        onResolved={() => {
          setDetailId(null)
          load()
        }}
        onDeleted={(customerId) => {
          setDetailId(null)
          setCustomers((prev) => prev.filter((c) => c.id !== customerId))
        }}
      />
    </div>
  )
}
