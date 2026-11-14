import { useEffect, useMemo, useState } from 'react'
import {
  LEAD_FILTERS,
  LEAD_STATE_LABEL,
  LEAD_STATE_TONE,
  OUTCOME_LABEL,
  OUTCOME_TONE,
  VISITS_PAGE_SIZE,
  deleteFieldSalesLeads,
  fetchLeadStates,
  formatDay,
  formatPlain,
  friendlyError,
} from '../../../lib/fieldSalesVisits'
import Icon from '../../shared/Icon'
import OverlayShell from '../../shared/OverlayShell'
import Toast from '../../shared/Toast'
import Table from '../../shared/table/Table'
import TableHead from '../../shared/table/TableHead'
import Th from '../../shared/table/Th'
import Td from '../../shared/table/Td'
import Tr from '../../shared/table/Tr'
import StatusBadge from '../../shared/table/StatusBadge'
import TopPagination from '../../shared/table/TopPagination'
import { useLeadSync, useNotifyChanged } from '../leadcapture/leadSync'
import AlertSettingsModal from './AlertSettingsModal'
import DeleteLeadConfirm from './DeleteLeadConfirm'
import LeadDetailModal from './LeadDetailModal'
import PainAreaManager from './PainAreaManager'
import VisitForm from './VisitForm'
import { PRIMARY, TOOL } from './visitFormStyles'

// Fixed column widths (literals — Tailwind only emits classes it can see): long values truncate with a tooltip and a row click opens the detail view,
// so no row is ever taller than another.
const COL = {
  last: 'w-[112px] min-w-[112px] max-w-[112px]',
  business: 'w-[200px] min-w-[200px] max-w-[200px]',
  person: 'w-[150px] min-w-[150px] max-w-[150px]',
  phone: 'w-[130px] min-w-[130px] max-w-[130px]',
  city: 'w-[120px] min-w-[120px] max-w-[120px]',
  rep: 'w-[140px] min-w-[140px] max-w-[140px]',
  state: 'w-[110px] min-w-[110px] max-w-[110px]',
  outcome: 'w-[84px] min-w-[84px] max-w-[84px]',
  num: 'w-[72px] min-w-[72px] max-w-[72px]',
  next: 'w-[170px] min-w-[170px] max-w-[170px]',
  actions: 'w-[44px] min-w-[44px] max-w-[44px]',
}

// What a saved visit says back to the rep (result of submit_field_sales_visit).
function savedMessage(r) {
  const where = r.adopted ? ' against your existing lead' : ''
  if (r.outcome === 'won') return { tone: 'success', text: `Visit saved${where} — the deal is Won and closed.` }
  if (r.outcome === 'lost') return { tone: 'success', text: `Visit saved${where} — the lead is closed as Lost.` }
  // Every Discovery counts as a meeting and puts the lead in Sales FMS at once; a follow-up never counts as one.
  const meeting = r.meeting_counted ? ' It counts as a meeting and the lead is in Sales FMS.' : ' It is not an extra meeting.'
  if (!r.completed) {
    // the director alert fires at exactly two visits without the demo (the Discovery counts as the first)
    const second = (r.open_pending || 0) === 2 ? ' This is the second visit without the demo — the Growth Director is notified.' : ''
    return { tone: 'warn', text: `Visit saved${where} — the demo was not given yet.${meeting}${second}` }
  }
  return { tone: 'success', text: `Visit saved${where}.${meeting}${r.meeting_counted ? '' : ' Sales FMS is updated.'}` }
}

// What a delete says back (result of delete_field_sales_leads).
function deletedMessage(r) {
  if (!r.deleted) return { tone: 'warn', text: 'Nothing was deleted — the lead may already be gone, or it is not yours.' }
  const v = r.visits_deleted || 0
  return { tone: 'success', text: `Lead deleted — ${v} visit${v === 1 ? '' : 's'}${r.enquiries_deleted ? ', its enquiry and its Sales FMS data' : ''} removed.` }
}

// The Field Sales Form tab's main view: the reps' LEADS (view field_sales_lead_state). A rep sees their own leads, an admin (field_sales_form_view_all) everyone's
// with a Rep column. Each lead is one row — its state (never visited / demo not given / demo given), the outcome (open / won / lost), visit counts and the next follow-up
// (flagged when overdue). A row click opens the read-only detail with every visit. "New Visit" (field_sales_form_create) opens the Visit Form in a modal, and a
// lead's detail can start a follow-up on it. Admins (field_sales_form_manage_dropdowns) also get "Pain areas" and "Alert settings".
// Data flow (same pattern as the other Lead Capture tables): { filter, page } + a retry nonce form a request key; a response for a superseded key is dropped;
// a write marks the other tabs stale. Messages are toasts, so nothing shifts.
// With canDelete a row (and the lead's detail window) offers Delete: a confirmation first, then delete_field_sales_leads (a rep's own leads; an admin's any).
// Props: admin, canCreate, canManage, canDelete, painAreas, painError, onPainChanged().
export default function FieldSalesLeadsTable({ admin, canCreate, canManage, canDelete = false, painAreas, painError, onPainChanged }) {
  const [query, setQuery] = useState({ filter: 'all', page: 1 })
  const [nonce, setNonce] = useState(0)
  const [result, setResult] = useState({ key: null, rows: [], total: 0, error: '' })
  const [toast, setToast] = useState(null)
  const [detailId, setDetailId] = useState(null)
  const [form, setForm] = useState({ open: false, preset: null })
  const [dirty, setDirty] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [deleting, setDeleting] = useState({ lead: null, busy: false })
  const [painEl, setPainEl] = useState(null)
  const [painOpen, setPainOpen] = useState(false)
  const painAnchor = useMemo(() => ({ current: painEl }), [painEl])

  const syncKey = useLeadSync({ holdFocus: form.open || !!detailId || !!deleting.lead })
  const changed = useNotifyChanged()
  const requestKey = `${nonce}|${syncKey}|${JSON.stringify(query)}`

  useEffect(() => {
    if (result.key === requestKey) return
    let cancelled = false
    fetchLeadStates({ filter: query.filter, page: query.page - 1 })
      .then(({ rows, total }) => {
        if (cancelled) return
        if (!rows.length && query.page > 1 && total > 0) {
          setQuery({ ...query, page: Math.ceil(total / VISITS_PAGE_SIZE) })
          return
        }
        setResult({ key: requestKey, rows, total, error: '' })
      })
      .catch((e) => !cancelled && setResult({ key: requestKey, rows: [], total: 0, error: friendlyError(e) }))
    return () => {
      cancelled = true
    }
  }, [requestKey, result.key, query])

  const { rows, total, error } = result
  const loading = result.key !== requestKey
  const firstLoad = result.key === null
  const detail = rows.find((r) => r.lead_id === detailId) || null
  const colCount = 10 + (admin ? 1 : 0) + (canDelete ? 1 : 0)

  const setFilter = (filter) => setQuery({ filter, page: 1 })

  function openForm(preset = null) {
    setDetailId(null)
    setDirty(false)
    setForm({ open: true, preset })
  }
  function closeForm() {
    if (dirty && !confirm('Discard this visit?\n\nEverything you have entered so far will be lost.')) return
    setForm({ open: false, preset: null })
    setDirty(false)
  }
  async function confirmDelete() {
    const lead = deleting.lead
    if (!lead || deleting.busy) return
    setDeleting({ lead, busy: true })
    try {
      const r = await deleteFieldSalesLeads([lead.lead_id])
      setDeleting({ lead: null, busy: false })
      setDetailId(null)
      setToast(deletedMessage(r))
      changed() // Sales FMS and Sales Rep MeCa in the other tabs are stale now
      setNonce((x) => x + 1)
    } catch (e) {
      setDeleting({ lead: null, busy: false })
      setToast({ tone: 'error', text: friendlyError(e) })
    }
  }
  function handleSaved(r) {
    setForm({ open: false, preset: null })
    setDirty(false)
    setToast(savedMessage(r))
    changed()
    setQuery((q) => ({ ...q, page: 1 }))
    setNonce((x) => x + 1)
  }

  return (
    <div>
      {firstLoad && loading && <div className="text-center py-10 text-text-muted text-[13px]">Loading leads…</div>}

      {error && !loading && (
        <div className="text-center py-10 text-danger text-[13px]">
          Could not load the leads: {error}
          <div className="mt-3 flex justify-center">
            <button type="button" onClick={() => setNonce((x) => x + 1)} className="px-3.5 py-2 rounded-lg border-[1.5px] border-danger text-danger text-[12.5px] font-bold bg-transparent">
              Retry
            </button>
          </div>
        </div>
      )}

      {!firstLoad && !error && (
        <div className={loading ? 'opacity-60 pointer-events-none' : ''}>
          <Table
            topScrollbar
            title={admin ? 'All Leads' : 'My Leads'}
            count={total}
            actions={
              <div className="flex items-center gap-1.5 flex-wrap justify-end">
                {canCreate && (
                  <button type="button" onClick={() => openForm()} className={`${TOOL} ${PRIMARY} shrink-0`} title="Log a visit" data-role="new-visit">
                    <Icon name="plus" size={13} />
                    New Visit
                  </button>
                )}
                {canManage && (
                  <>
                    <button
                      type="button"
                      onClick={(e) => {
                        setPainEl(e.currentTarget)
                        setPainOpen(true)
                      }}
                      disabled={!painAreas}
                      className={`${TOOL} shrink-0`}
                      title="Add, remove or rename the pain areas offered on the form"
                      data-role="pain-areas"
                    >
                      <Icon name="settings" size={13} />
                      Pain areas
                    </button>
                    <button type="button" onClick={() => setSettingsOpen(true)} className={`${TOOL} shrink-0`} title="Where the two-visits-without-a-demo alert is sent" data-role="alert-settings">
                      <Icon name="settings" size={13} />
                      Alert settings
                    </button>
                  </>
                )}
                <div role="group" aria-label="Show" className="inline-flex gap-1 shrink-0">
                  {LEAD_FILTERS.map((f) => (
                    <button key={f.value} type="button" aria-pressed={query.filter === f.value} onClick={() => setFilter(f.value)} className={`${TOOL} ${query.filter === f.value ? PRIMARY : ''}`} data-filter={f.value}>
                      {f.label}
                    </button>
                  ))}
                </div>
                <span className="inline-flex justify-end min-w-[150px]">
                  <TopPagination page={query.page} pageSize={VISITS_PAGE_SIZE} total={total} onPageChange={(p) => setQuery((q) => ({ ...q, page: p }))} />
                </span>
              </div>
            }
          >
            <TableHead>
              <Th className={COL.last}>Last visit</Th>
              {admin && <Th className={COL.rep}>Rep</Th>}
              <Th className={COL.business}>Business</Th>
              <Th className={COL.person}>Contact person</Th>
              <Th className={COL.phone}>Phone</Th>
              <Th className={COL.city}>City</Th>
              <Th className={COL.state}>Status</Th>
              <Th className={COL.outcome}>Outcome</Th>
              <Th className={COL.num} align="right">
                Visits
              </Th>
              <Th className={COL.num} align="right">
                No demo
              </Th>
              <Th className={COL.next}>Next follow-up</Th>
              {canDelete && (
                <Th className={COL.actions}>
                  <span className="sr-only">Actions</span>
                </Th>
              )}
            </TableHead>
            <tbody>
              {!rows.length ? (
                <tr>
                  <Td colSpan={colCount} align="center" className="py-10 text-text-muted">
                    {query.filter !== 'all' ? 'No leads match this filter.' : canCreate ? 'No leads yet — click New Visit to log one.' : 'No leads yet.'}
                    {query.filter !== 'all' && (
                      <button type="button" onClick={() => setFilter('all')} className="ml-2 text-primary font-semibold bg-transparent border-none underline">
                        Show all
                      </button>
                    )}
                  </Td>
                </tr>
              ) : (
                rows.map((r) => (
                  <Tr key={r.lead_id} onClick={() => setDetailId(r.lead_id)} title="Click row to view details" className="h-9">
                    <Td className={`${COL.last} whitespace-nowrap text-text-muted`}>{r.last_visit_at ? formatDay(r.last_visit_at) : '—'}</Td>
                    {admin && (
                      <Td className={`${COL.rep} truncate`} title={r.created_by_name || ''}>
                        {r.created_by_name || '—'}
                      </Td>
                    )}
                    <Td className={`${COL.business} truncate font-semibold text-text`} title={r.business_name}>
                      {r.business_name}
                    </Td>
                    <Td className={`${COL.person} truncate`} title={r.contact_person}>
                      {r.contact_person}
                    </Td>
                    <Td className={`${COL.phone} whitespace-nowrap`}>{r.contact_number}</Td>
                    <Td className={`${COL.city} truncate`} title={r.city}>
                      {r.city}
                    </Td>
                    <Td className={`${COL.state} whitespace-nowrap`}>
                      <StatusBadge tone={LEAD_STATE_TONE[r.lead_state] || 'neutral'}>{LEAD_STATE_LABEL[r.lead_state] || r.lead_state}</StatusBadge>
                    </Td>
                    <Td className={`${COL.outcome} whitespace-nowrap`}>
                      <StatusBadge tone={OUTCOME_TONE[r.outcome] || 'neutral'}>{OUTCOME_LABEL[r.outcome] || r.outcome}</StatusBadge>
                    </Td>
                    <Td className={`${COL.num} whitespace-nowrap`} align="right" numeric>
                      {r.visit_count}
                    </Td>
                    <Td className={`${COL.num} whitespace-nowrap`} align="right" numeric>
                      {r.pending_count || '—'}
                    </Td>
                    <Td className={`${COL.next} whitespace-nowrap`}>
                      {r.outcome !== 'open' || !r.next_followup_date ? (
                        <span className="text-text-muted">—</span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5">
                          {formatPlain(r.next_followup_date)}
                          {r.followup_overdue && <StatusBadge tone="danger">Overdue</StatusBadge>}
                        </span>
                      )}
                    </Td>
                    {canDelete && (
                      <Td className={`${COL.actions} whitespace-nowrap`} align="right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setDeleting({ lead: r, busy: false })
                          }}
                          aria-label={`Delete ${r.business_name}`}
                          title="Delete this lead"
                          className="inline-flex items-center justify-center h-7 w-7 rounded-lg border border-border bg-transparent text-text-muted hover:text-danger hover:border-danger"
                          data-role="delete-row"
                        >
                          <Icon name="trash" size={13} />
                        </button>
                      </Td>
                    )}
                  </Tr>
                ))
              )}
            </tbody>
          </Table>
        </div>
      )}

      {detail && (
        <LeadDetailModal summary={detail} admin={admin} canFollowUp={canCreate} canDelete={canDelete} onClose={() => setDetailId(null)} onFollowUp={(s) => openForm(s)} onDelete={(s) => setDeleting({ lead: s, busy: false })} />
      )}
      <DeleteLeadConfirm lead={deleting.lead} busy={deleting.busy} onConfirm={confirmDelete} onCancel={() => setDeleting({ lead: null, busy: false })} />

      {/* Closing it discards the form — and asks first if anything was entered. */}
      <OverlayShell open={form.open} onClose={closeForm} maxWidth="max-w-3xl" closeIcon={<Icon name="x" size={16} />}>
        <div className="text-[16px] font-semibold text-text mb-4 pr-10">{form.preset ? `Log a follow-up — ${form.preset.business_name}` : 'New Visit'}</div>
        {form.open && <VisitForm painAreas={painAreas} painError={painError} onPainChanged={onPainChanged} canManage={canManage} presetLead={form.preset} onSaved={handleSaved} onCancel={closeForm} onDirtyChange={setDirty} />}
      </OverlayShell>

      {settingsOpen && <AlertSettingsModal onClose={() => setSettingsOpen(false)} onSaved={() => setToast({ tone: 'success', text: 'Alert e-mail saved.' })} />}
      <PainAreaManager anchorRef={painAnchor} open={painOpen} onClose={() => setPainOpen(false)} items={painAreas} onChanged={onPainChanged} />
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  )
}
