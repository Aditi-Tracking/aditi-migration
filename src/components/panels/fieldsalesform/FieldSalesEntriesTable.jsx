import { useEffect, useRef, useState } from 'react'
import {
  DEMO_FILTER_OPTIONS,
  FIELD_SALES_FILTER_SPEC,
  FIELD_SALES_PAGE_SIZE,
  FIELD_SALES_SORT_KINDS,
  FMS_FILTER_OPTIONS,
  FS_LIST,
  emptyFieldSalesFilters,
  fetchFieldSalesColumnValues,
  fetchFieldSalesEntries,
  formatEntryDate,
  formatINR,
  formatPlainDate,
  leadStageTone,
  deleteFieldSalesEntries,
} from '../../../lib/fieldSalesForm'
import { countActiveFilters, isFilterActive } from '../../../lib/tableFilters'
import Icon from '../../shared/Icon'
import OverlayShell from '../../shared/OverlayShell'
import Toast from '../../shared/Toast'
import Table from '../../shared/table/Table'
import TableHead from '../../shared/table/TableHead'
import Th from '../../shared/table/Th'
import Td from '../../shared/table/Td'
import Tr from '../../shared/table/Tr'
import { CheckboxTd, CheckboxTh } from '../../shared/table/CheckboxCell'
import ColumnFilter from '../../shared/table/ColumnFilter'
import StatusBadge from '../../shared/table/StatusBadge'
import TopPagination from '../../shared/table/TopPagination'
import { useLeadSync, useNotifyChanged } from '../leadcapture/leadSync'
import FieldSalesDetailModal from './FieldSalesDetailModal'
import FieldSalesEntryForm from './FieldSalesEntryForm'

const TOOL = 'inline-flex items-center justify-center gap-1.5 h-7 min-w-7 px-2 rounded-lg border border-border bg-transparent text-text-muted text-[12px] font-semibold hover:bg-surface-2 hover:text-text disabled:opacity-50'
const PRIMARY = '!bg-primary !text-white !border-primary'
const DANGER = '!text-danger !border-danger hover:!bg-danger-tint'
// Fixed column widths (written as literals — Tailwind only emits classes it can see): long values are truncated
// with a tooltip and the row click opens the detail modal, so no row can ever grow taller than another.
const COL = {
  date: 'w-[112px] min-w-[112px] max-w-[112px]',
  rep: 'w-[140px] min-w-[140px] max-w-[140px]',
  lead: 'w-[170px] min-w-[170px] max-w-[170px]',
  contact: 'w-[130px] min-w-[130px] max-w-[130px]',
  city: 'w-[120px] min-w-[120px] max-w-[120px]',
  state: 'w-[140px] min-w-[140px] max-w-[140px]',
  source: 'w-[140px] min-w-[140px] max-w-[140px]',
  purpose: 'w-[150px] min-w-[150px] max-w-[150px]',
  stage: 'w-[100px] min-w-[100px] max-w-[100px]',
  demo: 'w-[72px] min-w-[72px] max-w-[72px]',
  products: 'w-[220px] min-w-[220px] max-w-[220px]',
  fleet: 'w-[84px] min-w-[84px] max-w-[84px]',
  revenue: 'w-[128px] min-w-[128px] max-w-[128px]',
  expected: 'w-[124px] min-w-[124px] max-w-[124px]',
  fms: 'w-[104px] min-w-[104px] max-w-[104px]',
}
const initialQuery = () => ({ page: 1, filters: emptyFieldSalesFilters(), sort: null })
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`
// A pick-list as filter options. A view_all user may also receive RETIRED values (RLS), so old entries can still
// be filtered by a source / stage that has since been retired — flagged with a hint.
const listFilterOptions = (list) => (list || []).map((o) => ({ value: o.value, label: o.value, hint: o.is_active ? undefined : 'retired' }))

// What a Delete call reports: { requested, deleted, skipped, deleted_sent (pushed entries among them), enquiries_deleted }. Skipped
// entries were already deleted, not the caller's — or, without enquiry_delete_sent, already pushed. A partial result keeps its
// reason on screen until dismissed (see Toast).
function deleteOutcome({ requested, deleted, skipped, deleted_sent: pushedCount = 0, enquiries_deleted: enquiries = 0 }, canDeletePushed) {
  const why = canDeletePushed ? 'already deleted or not yours' : 'already pushed, already deleted, or not yours'
  const extra = pushedCount > 0 ? ` (${pushedCount} already pushed to FMS${enquiries > 0 ? `, with ${plural(enquiries, 'enquiry', 'enquiries')}` : ''})` : ''
  if (deleted === 0) return { tone: 'warn', text: `Nothing deleted — ${requested === 1 ? 'it was' : `all ${requested} were`} ${why}.` }
  if (skipped > 0) return { tone: 'warn', text: `Deleted ${deleted}${extra} · ${skipped} skipped (${why}).` }
  return { tone: 'success', text: `Deleted ${plural(deleted, 'entry', 'entries')}${extra}.` }
}

// The confirmation before a Delete. Pushed entries in the selection say what else goes with them (their enquiry, its Sales FMS
// pipeline, the MeCa figures — past periods included); every deletion reaches Sales Rep MeCa, which counts each entry as a meeting.
function deleteConfirmText(chosen, canDeletePushed) {
  const n = chosen.length
  const them = n === 1 ? 'it' : 'them'
  const restore = `It can't be undone from the portal — only an administrator can restore ${them} from the database.`
  const pushed = chosen.filter((r) => r.sent_to_fms_at).length
  const lines = [`Delete ${plural(n, 'entry', 'entries')}?`, '', `This removes ${them} from the Field Sales Form for everyone, and from Sales Rep MeCa, where each entry counts as a meeting — the numbers of PAST periods change too.`]
  if (pushed) {
    lines.push('', `${pushed === n ? (n === 1 ? 'It was' : 'All were') : `${pushed} of them were`} pushed to FMS. Deleting ${pushed === 1 ? 'a pushed entry' : 'pushed entries'} also removes the enquiry created in the Enquiry Capture Sheet, its Sales FMS pipeline (stage dates, amounts, remarks) and its sales from MeCa.`)
  }
  lines.push('', restore + (canDeletePushed ? '' : ' Entries already pushed to FMS can\'t be deleted.'))
  return lines.join('\n')
}

// A toolbar control that is only sometimes relevant keeps its place: rendered invisible (not focusable, not clickable)
// in a fixed-width slot instead of being removed, so its appearing never shifts a neighbour.
function Slot({ show, width, children }) {
  return (
    <span className={`inline-flex shrink-0 ${width} ${show ? '' : 'invisible'}`} aria-hidden={!show}>
      {children}
    </span>
  )
}

// The Field Sales entries — the first thing the Field Sales Form tab shows. One component, two shapes (decided by `admin`
// = field_sales_form_view_all):
//   - admin: every rep's entries, a Rep column and per-column filters (Excel-style value checklists).
//   - normal: the user's OWN entries — RLS already returns exactly those, so nothing is client-filtered.
// EVERY column sorts for everyone (Excel-style, in each header's menu). Entries are write-once, so nothing is editable: a
// row click opens the read-only detail modal. With `canCreate`, "+ New Entry" opens the entry form in a modal (a modal,
// like FMS's New Order: closing it throws the form away — and asks first if anything was typed). A saved entry goes to Sales FMS BY ITSELF (the
// database pushes it the moment it is submitted): there is no Push button; the FMS column shows when it went.
//
// Data flow (same pattern as the Enquiry Capture Sheet): `query` ({ page, filters, sort }) + a retry nonce form a request key;
// the loaded `result` remembers which key it answers, so "loading" is derived and a response for a superseded key is dropped.
// A new filter or sort goes back to page 1. Selection is per page and cleared whenever a result arrives.
// Layout stability: messages are toasts (they cannot push anything), and the toolbar's conditional controls sit in
// fixed slots.
// With `canDelete` (field_sales_form_delete) the toolbar also gets a Delete button: a soft delete of the user's own entries (anyone's
// with view_all). A PUSHED entry is selectable only with `canDeletePushed` (also enquiry_delete_sent): deleting it deletes its enquiry
// too.
// Props: admin, canDelete, canDeletePushed, canCreate, canManage, lists (the pick-lists; null while loading), listsError, onListsChanged().
export default function FieldSalesEntriesTable({ admin, canDelete, canDeletePushed, canCreate, canManage, lists, listsError, onListsChanged }) {
  const [query, setQuery] = useState(initialQuery)
  const [nonce, setNonce] = useState(0)
  const [result, setResult] = useState({ key: null, rows: [], total: 0, error: '' })
  const [selected, setSelected] = useState(() => new Set())
  const [toast, setToast] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [detailId, setDetailId] = useState(null)
  const [newOpen, setNewOpen] = useState(false)
  const [dirty, setDirty] = useState(false)
  const deletingRef = useRef(false) // same, for Delete

  const syncKey = useLeadSync({ holdFocus: selected.size > 0 || newOpen || !!detailId }) // another tab changed something, or the window came back
  const changed = useNotifyChanged() // after a successful write: every other tab becomes stale
  const requestKey = `${nonce}|${syncKey}|${JSON.stringify(query)}`

  useEffect(() => {
    if (result.key === requestKey) return
    let cancelled = false
    fetchFieldSalesEntries({ filters: admin ? query.filters : {}, sort: query.sort, page: query.page - 1 })
      .then(({ rows, total }) => {
        if (cancelled) return
        // The page we asked for no longer exists (e.g. a filter changed under us) — step back to the last page.
        if (!rows.length && query.page > 1 && total > 0) {
          setQuery({ ...query, page: Math.ceil(total / FIELD_SALES_PAGE_SIZE) })
          return
        }
        setResult({ key: requestKey, rows, total, error: '' })
        setSelected(new Set())
      })
      .catch((e) => {
        if (!cancelled) setResult({ key: requestKey, rows: [], total: 0, error: e.message })
      })
    return () => {
      cancelled = true
    }
  }, [requestKey, result.key, query, admin])

  const { rows, total, error } = result
  const loading = result.key !== requestKey
  const firstLoad = result.key === null
  const tooMany = /Too many filter values/.test(error) // no retry can fix this one — only removing filters
  const canSelect = canDelete // the checkbox column serves Delete
  // every entry is pushed on submission, so a selectable entry is a PUSHED one: it needs enquiry_delete_sent (its enquiry goes with it)
  const selectable = canSelect ? rows.filter((r) => (r.sent_to_fms_at ? canDeletePushed : true)) : []
  const allSelected = selectable.length > 0 && selectable.every((r) => selected.has(r.id))
  const someSelected = selectable.some((r) => selected.has(r.id))
  const detail = rows.find((r) => r.id === detailId) || null
  const filtersActive = countActiveFilters(FIELD_SALES_FILTER_SPEC, query.filters) > 0 || isFilterActive('checklist', query.filters.fms)
  const colCount = 13 + (canSelect ? 1 : 0) + (admin ? 1 : 0)

  const changeFilter = (key, value) => setQuery((q) => ({ ...q, page: 1, filters: { ...q.filters, [key]: value } }))
  const changeSort = (key, dir) => setQuery((q) => ({ ...q, page: 1, sort: dir ? { key, dir } : null }))
  const clearFilters = () => setQuery((q) => ({ ...q, page: 1, filters: emptyFieldSalesFilters() }))
  const changePage = (p) => setQuery((q) => ({ ...q, page: p }))

  function toggleOne(id, checked) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }
  const toggleAll = (checked) => setSelected(checked ? new Set(selectable.map((r) => r.id)) : new Set())

  async function handleDelete() {
    const chosen = rows.filter((r) => selected.has(r.id))
    const ids = chosen.map((r) => r.id)
    if (!ids.length || deletingRef.current) return
    if (!confirm(deleteConfirmText(chosen, canDeletePushed))) return
    deletingRef.current = true
    setDeleting(true)
    setToast(null)
    try {
      setToast(deleteOutcome(await deleteFieldSalesEntries(ids), canDeletePushed))
      changed()
      setNonce((x) => x + 1) // refetch: the rows are gone; selection clears; a page that emptied steps back
    } catch (e) {
      // Nothing was deleted (the RPC is atomic) — leave the rows ticked so the user can simply retry.
      setToast({ tone: 'error', text: e.message })
    } finally {
      deletingRef.current = false
      setDeleting(false)
    }
  }

  // ---- New Entry modal ----
  function closeNew() {
    if (dirty && !confirm('Discard this entry?\n\nEverything you have typed so far will be lost.')) return
    setNewOpen(false)
    setDirty(false)
  }
  function handleCreated(saved) {
    setNewOpen(false)
    setDirty(false)
    setToast({ tone: 'success', text: `Entry saved for ${saved?.lead_name || 'the lead'}.` })
    changed()
    setQuery((q) => ({ ...q, page: 1 })) // newest first — back to page 1 so it is there (a sort may still place it elsewhere)
    setNonce((x) => x + 1)
  }

  // ---- header menus: every column sorts; the admin's also filter ----
  const f = query.filters
  const sortFor = (key) => ({ kind: FIELD_SALES_SORT_KINDS[key], current: query.sort?.key === key ? query.sort.dir : null, onSort: (dir) => changeSort(key, dir) })
  const sortOnly = (key, label) => <ColumnFilter label={label} kind="none" sort={sortFor(key)} />
  const filtered = (key, label, kind, extra = {}) => (admin ? <ColumnFilter label={label} kind={kind} value={f[key]} onChange={(v) => changeFilter(key, v)} sort={sortFor(key)} {...extra} /> : sortOnly(key, label))
  const valuesFilter = (key, label) => filtered(key, label, 'checklist', { loadValues: () => fetchFieldSalesColumnValues(key, query.filters) })
  const listFilter = (key, label, type) => filtered(key, label, 'checklist', { options: listFilterOptions(lists?.[type]), nonNullable: true })

  return (
    <div>
      {firstLoad && loading && <div className="text-center py-10 text-text-muted text-[13px]">Loading entries…</div>}

      {error && !loading && (
        <div className="text-center py-10 text-danger text-[13px]">
          Could not load entries: {error}
          <div className="mt-3 flex justify-center gap-2">
            {!tooMany && (
              <button type="button" onClick={() => setNonce((x) => x + 1)} className="px-3.5 py-2 rounded-lg border-[1.5px] border-danger text-danger text-[12.5px] font-bold bg-transparent">
                Retry
              </button>
            )}
            {filtersActive && (
              <button type="button" onClick={clearFilters} className="px-3.5 py-2 rounded-lg border-[1.5px] border-danger text-danger text-[12.5px] font-bold bg-transparent">
                Clear filters
              </button>
            )}
          </div>
        </div>
      )}

      {!firstLoad && !error && (
        <div className={loading ? 'opacity-60 pointer-events-none' : ''}>
          <Table
            topScrollbar
            title={admin ? 'All Entries' : 'My Entries'}
            count={total}
            actions={
              <div className="flex items-center gap-1.5 flex-wrap justify-end">
                {canCreate && (
                  <button type="button" onClick={() => setNewOpen(true)} className={`${TOOL} ${PRIMARY} shrink-0`} title="Add a new entry">
                    <Icon name="plus" size={13} />
                    New Entry
                  </button>
                )}
                <Slot show={filtersActive} width="w-[104px]">
                  <button type="button" onClick={clearFilters} tabIndex={filtersActive ? 0 : -1} className={`${TOOL} w-full`}>
                    Clear filters
                  </button>
                </Slot>
                {canSelect && (
                  <Slot show={selected.size > 0} width="w-[118px]">
                    <button type="button" onClick={() => setSelected(new Set())} className={`${TOOL} w-full`}>
                      Clear selection
                    </button>
                  </Slot>
                )}
                {canDelete && (
                  <Slot show={selected.size > 0} width="w-[132px]">
                    <button type="button" disabled={deleting || loading} onClick={handleDelete} className={`${TOOL} ${DANGER} w-full`}>
                      <Icon name={deleting ? 'loader' : 'trash'} size={13} />
                      {deleting ? 'Deleting…' : `Delete ${selected.size}`}
                    </button>
                  </Slot>
                )}
                <span className="inline-flex justify-end min-w-[150px]">
                  <TopPagination page={query.page} pageSize={FIELD_SALES_PAGE_SIZE} total={total} onPageChange={changePage} />
                </span>
              </div>
            }
          >
            <TableHead>
              {canSelect &&
                (selectable.length ? (
                  <CheckboxTh checked={allSelected} indeterminate={someSelected && !allSelected} onChange={toggleAll} />
                ) : (
                  <th className="px-2 py-2 w-8" />
                ))}
              <Th className={COL.date} filter={filtered('date', 'Date', 'dateRange')}>
                Date
              </Th>
              {admin && (
                <Th className={COL.rep} filter={valuesFilter('rep', 'Rep')}>
                  Rep
                </Th>
              )}
              <Th className={COL.lead} filter={valuesFilter('lead', 'Lead Name')}>
                Lead Name
              </Th>
              <Th className={COL.contact} filter={valuesFilter('contact', 'Contact')}>
                Contact
              </Th>
              <Th className={COL.city} filter={valuesFilter('city', 'City')}>
                City
              </Th>
              <Th className={COL.state} filter={valuesFilter('state', 'State')}>
                State
              </Th>
              <Th className={COL.source} filter={listFilter('source', 'Source', FS_LIST.SOURCE)}>
                Source
              </Th>
              <Th className={COL.purpose} filter={listFilter('purpose', 'Purpose', FS_LIST.PURPOSE)}>
                Purpose
              </Th>
              <Th className={COL.stage} filter={listFilter('stage', 'Lead Stage', FS_LIST.STAGE)}>
                Stage
              </Th>
              <Th className={COL.demo} filter={filtered('demo', 'Demo', 'checklist', { options: DEMO_FILTER_OPTIONS, nonNullable: true })}>
                Demo
              </Th>
              <Th className={COL.products} filter={sortOnly('products', 'Products')}>
                Products
              </Th>
              <Th className={COL.fleet} align="right" filter={sortOnly('fleet', 'Fleet')}>
                Fleet
              </Th>
              <Th className={COL.revenue} align="right" filter={sortOnly('revenue', 'Exp. Revenue')}>
                Exp. Revenue
              </Th>
              <Th className={COL.expected} filter={sortOnly('expected', 'Exp. Date')}>
                Exp. Date
              </Th>
              <Th className={COL.fms} filter={filtered('fms', 'FMS', 'checklist', { options: FMS_FILTER_OPTIONS, nonNullable: true })}>
                FMS
              </Th>
            </TableHead>
            <tbody>
              {!rows.length ? (
                <tr>
                  <Td colSpan={colCount} align="center" className="py-10 text-text-muted">
                    {admin ? (
                      <>
                        No entries found.
                        {filtersActive && (
                          <button type="button" onClick={clearFilters} className="ml-2 text-primary font-semibold bg-transparent border-none underline">
                            Clear filters
                          </button>
                        )}
                      </>
                    ) : canCreate ? (
                      'No entries yet — click New Entry to add one.'
                    ) : (
                      'No entries yet.'
                    )}
                  </Td>
                </tr>
              ) : (
                rows.map((r) => {
                  const pushed = !!r.sent_to_fms_at
                  const products = (r.product_interested || []).join(', ')
                  return (
                    <Tr key={r.id} onClick={() => setDetailId(r.id)} title="Click row to view details" className="h-9">
                      {canSelect && (pushed && !canDeletePushed ? <td className="px-2 py-2 w-8" /> : <CheckboxTd checked={selected.has(r.id)} onChange={(c) => toggleOne(r.id, c)} />)}
                      <Td className={`${COL.date} whitespace-nowrap text-text-muted`}>{formatEntryDate(r.created_at)}</Td>
                      {admin && (
                        <Td className={`${COL.rep} truncate`} title={r.entered_by_email || ''}>
                          {r.entered_by_name || r.entered_by_email || '—'}
                        </Td>
                      )}
                      <Td className={`${COL.lead} truncate font-semibold text-text`} title={r.lead_name}>
                        {r.lead_name}
                      </Td>
                      <Td className={`${COL.contact} whitespace-nowrap`}>{r.contact_number}</Td>
                      <Td className={`${COL.city} truncate`} title={r.city}>
                        {r.city}
                      </Td>
                      <Td className={`${COL.state} truncate`} title={r.state}>
                        {r.state}
                      </Td>
                      <Td className={`${COL.source} truncate`} title={r.source_of_lead}>
                        {r.source_of_lead}
                      </Td>
                      <Td className={`${COL.purpose} truncate`} title={r.visit_purpose}>
                        {r.visit_purpose}
                      </Td>
                      <Td className={`${COL.stage} whitespace-nowrap`}>
                        <StatusBadge tone={leadStageTone(r.lead_stage)}>{r.lead_stage}</StatusBadge>
                      </Td>
                      <Td className={`${COL.demo} whitespace-nowrap`}>{r.demo_given ? 'Yes' : 'No'}</Td>
                      <Td className={`${COL.products} truncate`} title={products}>
                        {products}
                      </Td>
                      <Td className={`${COL.fleet} whitespace-nowrap`} align="right" numeric>
                        {r.fleet_size}
                      </Td>
                      <Td className={`${COL.revenue} whitespace-nowrap`} align="right" numeric>
                        {formatINR(r.expected_revenue)}
                      </Td>
                      <Td className={`${COL.expected} whitespace-nowrap`}>{formatPlainDate(r.expected_amount_receiving_date)}</Td>
                      <Td className={`${COL.fms} whitespace-nowrap`} title={pushed ? `Pushed ${new Date(r.sent_to_fms_at).toLocaleString('en-IN')}` : ''}>
                        {pushed ? (
                          <StatusBadge tone="success">
                            <Icon name="check" size={11} strokeWidth={3} />
                            Pushed
                          </StatusBadge>
                        ) : (
                          <span className="text-text-muted">—</span>
                        )}
                      </Td>
                    </Tr>
                  )
                })
              )}
            </tbody>
          </Table>
        </div>
      )}

      <FieldSalesDetailModal entry={detail} admin={admin} onClose={() => setDetailId(null)} />

      {/* Closing it discards the form — and asks first if anything was typed. */}
      <OverlayShell open={newOpen} onClose={closeNew} maxWidth="max-w-3xl" closeIcon={<Icon name="x" size={16} />}>
        <div className="text-[16px] font-semibold text-text mb-4 pr-10">New Entry</div>
        <FieldSalesEntryForm lists={lists} listsError={listsError} onListsChanged={onListsChanged} canManage={canManage} onSaved={handleCreated} onCancel={closeNew} onDirtyChange={setDirty} />
      </OverlayShell>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  )
}
