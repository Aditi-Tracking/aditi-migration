import { useState } from 'react'
import OverlayShell from '../../shared/OverlayShell'
import { useAuth } from '../../../context/AuthContext'
import { Section, FieldGrid, FieldRow } from './DetailSection'
import NotesThread from './NotesThread'
import NoteActionDialog from './NoteActionDialog'
import { accountsPersonNameById, canDeleteAccountsFlag, canResolveAccountsFlag, deleteAccountsFlag, locationLabel } from '../../../lib/renewals'

// Ported from old-portal/js/renewals.js's ruOpenAccountsDetail/
// ruDeleteAccountsFlag. Resolve and Delete both live only here, never as
// row-level actions in the Accounts table. Resolve is isMIS || isAccounts
// specifically — NOT the isMIS || fullDataAccess full-access gate used
// elsewhere in this module. Delete is MIS, or the original flagger if that
// flagger isn't Accounts-tier (an Accounts-tier person never sees Delete,
// even on a flag they raised themselves as a dual-role user) — mirrors
// delete_accounts_flag's own server-side gate, doesn't rely on it alone.
export default function AccountsDetailModal({ open, customer, personsById, resolveAuthorName, isMIS, isAccounts, onClose, onResolved, onDeleted }) {
  const { currentUser } = useAuth()
  const [resolveOpen, setResolveOpen] = useState(false)

  if (!customer) return null

  const isOpen = customer.accounts_flag_status === 'open'
  const snap = customer._snapshot
  const money = (v) => (snap ? '₹' + Number(v || 0).toLocaleString('en-IN') : '—')

  const canResolve = canResolveAccountsFlag({ isMIS, isAccounts })
  const canDelete = canDeleteAccountsFlag({
    isMIS,
    isAccounts,
    flaggedByEmail: customer.accounts_flagged_by,
    myEmail: currentUser?.email || '',
  })

  async function handleDelete() {
    const ok = confirm(
      'This will permanently delete this flag and all its notes. The customer itself will NOT be affected and stays exactly as-is in My Customers. This cannot be undone. Continue?'
    )
    if (!ok) return
    try {
      await deleteAccountsFlag(customer.id)
      onDeleted(customer.id)
    } catch (e) {
      alert('❌ Could not delete flag: ' + e.message)
    }
  }

  return (
    <>
      <OverlayShell open={open} onClose={onClose} maxWidth="max-w-3xl">
        <div className="mb-4 pr-6">
          <div className="text-[16px] font-semibold text-primary">{customer.billing_name}</div>
          <div className="text-[12px] text-text-muted mt-0.5">{locationLabel(customer.location)}</div>
        </div>

        <div className="flex flex-col md:flex-row gap-5">
          <div className="flex-1 min-w-0 space-y-3">
            <Section title="Customer">
              <FieldGrid>
                <FieldRow label="Location" value={locationLabel(customer.location)} />
                <FieldRow label="Category" value={customer.category || '—'} />
                <FieldRow label="Assigned To" value={accountsPersonNameById(customer.assigned_crm_person_id, personsById)} />
              </FieldGrid>
            </Section>

            <Section title="Outstanding">
              <FieldGrid>
                <FieldRow label="Grand Total" value={snap ? money(snap.grand_total) : '—'} />
                <FieldRow label="0–30 days" value={money(snap?.bucket_0_30)} />
                <FieldRow label="31–60 days" value={money(snap?.bucket_31_60)} />
                <FieldRow label="61–90 days" value={money(snap?.bucket_61_90)} />
                <FieldRow label="90+ days" value={money(snap?.bucket_above_90)} />
              </FieldGrid>
            </Section>

            <Section title="Flag Status" tint>
              <FieldGrid>
                <FieldRow label="Status" value={isOpen ? 'Open' : 'Resolved'} />
                <FieldRow label="Flagged By" value={resolveAuthorName(customer.accounts_flagged_by)} />
                <FieldRow
                  label="Flagged On"
                  value={customer.accounts_flagged_at ? new Date(customer.accounts_flagged_at).toLocaleString('en-IN') : '—'}
                />
                {!isOpen && (
                  <>
                    <FieldRow label="Resolved By" value={resolveAuthorName(customer.accounts_resolved_by)} />
                    <FieldRow
                      label="Resolved On"
                      value={customer.accounts_resolved_at ? new Date(customer.accounts_resolved_at).toLocaleString('en-IN') : '—'}
                    />
                  </>
                )}
              </FieldGrid>
              {(canResolve && isOpen) || canDelete ? (
                <div className="flex gap-2 mt-3">
                  {isOpen && canResolve && (
                    <button
                      type="button"
                      onClick={() => setResolveOpen(true)}
                      className="flex-1 rounded-lg bg-primary text-white font-bold text-[13px] py-2"
                    >
                      Mark Resolved
                    </button>
                  )}
                  {canDelete && (
                    <button
                      type="button"
                      onClick={handleDelete}
                      className="flex-1 rounded-lg border border-danger/40 bg-danger-tint text-danger font-bold text-[13px] py-2"
                    >
                      🗑️ Delete
                    </button>
                  )}
                </div>
              ) : null}
            </Section>
          </div>

          <div className="flex-1 min-w-0">
            <Section title="Notes">
              <NotesThread customerId={customer.id} isAccounts={isAccounts} resolveAuthorName={resolveAuthorName} />
            </Section>
          </div>
        </div>
      </OverlayShell>

      <NoteActionDialog
        open={resolveOpen}
        mode="resolve"
        customerId={customer.id}
        onClose={() => setResolveOpen(false)}
        onSubmitted={() => {
          setResolveOpen(false)
          onResolved()
        }}
      />
    </>
  )
}
