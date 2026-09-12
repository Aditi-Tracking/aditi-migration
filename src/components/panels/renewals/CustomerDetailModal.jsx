import { useEffect, useState } from 'react'
import OverlayShell from '../../shared/OverlayShell'
import CallHistoryList from './CallHistoryList'
import { Section, FieldGrid, FieldRow } from './DetailSection'
import {
  RU_CATEGORY_ORDER,
  currentOutstandingValue,
  fetchCustomerCallHistory,
  lastCallText,
  reassignCustomer,
  updateCustomerCategory,
} from '../../../lib/renewals'

// Ported from old-portal/js/renewals.js's ruOpenCustomerDetail/
// _ruDetailAccountSectionHtml/ruSaveCategoryField. Category is the one
// editable field in the read-only sections — it has no other entry point
// anywhere in production. Reassign lives here too (moved from a Phase 1a
// row placement that had no counterpart in production — the row itself has
// no inline reassign select in old-portal, only this modal does).
export default function CustomerDetailModal({ open, customer, persons, crmPerson, getUrl, clearScreenshotCache, onClose, onCategorySaved, onReassigned, onOpenLightbox }) {
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(true)

  useEffect(() => {
    if (!open || !customer) return
    let cancelled = false
    clearScreenshotCache()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-time fetch whenever a (possibly different) customer's detail opens
    setHistoryLoading(true)
    fetchCustomerCallHistory(customer.id)
      .then((rows) => {
        if (cancelled) return
        setHistory(rows)
        setHistoryLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setHistory([])
        setHistoryLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the open customer's identity changes
  }, [open, customer?.id])

  if (!customer) return null

  const currentOutstanding = currentOutstandingValue(customer)
  const grandTotal = customer._snapshot ? Number(customer._snapshot.grand_total).toLocaleString('en-IN') : '—'

  async function handleCategoryChange(e) {
    const value = e.target.value
    try {
      const freq = await updateCustomerCategory(customer.id, value)
      onCategorySaved(customer.id, value || null, freq)
    } catch (err) {
      alert('❌ Could not save: ' + err.message)
      e.target.value = customer.category || ''
    }
  }

  async function handleReassignChange(e) {
    const value = e.target.value
    if (!value) return
    const newPersonId = value === '__unassign__' ? null : value
    const label =
      value === '__unassign__' ? 'move this customer to the unassigned pool' : 'reassign this customer to the selected person'
    if (!confirm(`Are you sure you want to ${label}? It will disappear from your list.`)) {
      e.target.value = ''
      return
    }
    try {
      await reassignCustomer({ customerId: customer.id, newPersonId })
      onReassigned(customer.id)
      onClose() // it just left this person's list — nothing left to show
    } catch (err) {
      alert('❌ Could not reassign: ' + err.message)
      e.target.value = ''
    }
  }

  return (
    <OverlayShell open={open} onClose={onClose} maxWidth="max-w-3xl">
      <div className="mb-4 pr-6">
        <div className="text-[16px] font-semibold text-primary">{customer.billing_name}</div>
        <div className="text-[12px] text-text-muted mt-0.5">
          {customer.category || 'Uncategorized'}
          {customer.city ? ` · ${customer.city}` : ''}
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-5">
        <div className="flex-1 min-w-0 space-y-3">
          <Section title="Contact">
            <FieldGrid>
              <FieldRow label="City" value={customer.city || '—'} />
              <FieldRow label="Contact Person" value={customer.contact_person || '—'} />
              <FieldRow label="Contact Number" value={customer.contact_number || '—'} />
            </FieldGrid>
          </Section>

          <Section title="Account">
            <FieldGrid>
              <span className="text-text-muted font-semibold">Category</span>
              <select
                defaultValue={customer.category || ''}
                onChange={handleCategoryChange}
                className="rounded-md border border-border bg-surface-2 text-text text-[12.5px] px-2 py-1"
              >
                <option value="">Uncategorized</option>
                {RU_CATEGORY_ORDER.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
              <FieldRow label="Frequency" value={customer.calling_frequency || '—'} />
              <FieldRow label="Status" value={customer.crm_status || '—'} />
              <FieldRow label="Last Call" value={lastCallText(customer)} />
            </FieldGrid>
          </Section>

          <Section title="Financial">
            <FieldGrid>
              <FieldRow label="Outstanding" value={grandTotal} />
              <FieldRow label="Received Amount" value={Number(customer.recovered_amount || 0).toLocaleString('en-IN')} />
              <FieldRow label="Current Outstanding" value={currentOutstanding !== null ? currentOutstanding.toLocaleString('en-IN') : '—'} />
            </FieldGrid>
          </Section>

          <Section title="Actions" tint>
            <label className="block text-[11px] font-semibold text-text-muted mb-1">Reassign To</label>
            <select
              defaultValue=""
              onChange={handleReassignChange}
              className="w-full rounded-md border border-border bg-surface-2 text-text text-[12.5px] px-2 py-1.5"
            >
              <option value="">Reassign…</option>
              <option value="__unassign__">— Move to unassigned pool —</option>
              {persons
                .filter((p) => p.id !== crmPerson?.id)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </Section>
        </div>

        <div className="flex-1 min-w-0">
          <Section title="Call History">
            <CallHistoryList rows={history} loading={historyLoading} getUrl={getUrl} onOpenLightbox={onOpenLightbox} />
          </Section>
        </div>
      </div>
    </OverlayShell>
  )
}
