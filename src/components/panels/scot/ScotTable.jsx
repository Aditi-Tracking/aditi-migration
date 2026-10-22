import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../../context/AuthContext'
import { useColumnPrefs } from '../../../lib/columnPrefs'
import {
  CALL_STATE_LABELS, CALL_STATE_TONE, CREATED_VIA_LABELS, SCOT_FILTER_SPEC, SCOT_OUTCOME_TYPE, SCOT_PAGE_SIZE, SCOT_SORT_KINDS, STATUS_LABELS,
  clearScotOutcomeCache, deleteScotClients, emptyScotFilters, fetchScotColumnValues, fetchScotList, fetchScotRow, isMeetingOutcome, setScotOutcomeNextCallDays,
} from '../../../lib/scot'
import { addDropdownOption, setDropdownOptionActive } from '../../../lib/enquiries'
import { fmtDay, fmtMoment } from '../../../lib/fmsFormat'
import { countActiveFilters } from '../../../lib/tableFilters'
import Icon from '../../shared/Icon'
import ManageListPopover from '../../shared/ManageListPopover'
import Table from '../../shared/table/Table'
import TableHead from '../../shared/table/TableHead'
import Th from '../../shared/table/Th'
import Td from '../../shared/table/Td'
import Tr from '../../shared/table/Tr'
import StatusBadge from '../../shared/table/StatusBadge'
import ColumnFilter from '../../shared/table/ColumnFilter'
import ColumnPicker from '../../shared/table/ColumnPicker'
import { CheckboxTd, CheckboxTh } from '../../shared/table/CheckboxCell'
import ToolbarSlot from '../../shared/table/ToolbarSlot'
import TopPagination from '../../shared/table/TopPagination'
import Toast from '../../shared/Toast'
import { useLeadSync, useNotifyChanged } from '../leadcapture/leadSync'
import { COL, SCOT_COLUMNS, SCOT_COLUMN_FILTERS, SCOT_TILES } from './scotColumns'
import ScotAddDialog from './ScotAddDialog'
import ScotClientModal from './ScotClientModal'
import ScotKpiStrip from './ScotKpiStrip'
import ScotLogCallDialog from './ScotLogCallDialog'
import ScotUploadDialog from './ScotUploadDialog'

const TOOL = 'inline-flex items-center justify-center gap-1.5 h-7 min-w-7 px-2 rounded-lg border border-border bg-transparent text-text-muted text-[12px] font-semibold hover:bg-surface-2 hover:text-text disabled:opacity-50'
const PRIMARY = '!bg-primary !text-white !border-primary'
const DANGER = '!text-danger !border-danger hover:!bg-danger-tint'
const initialQuery = () => ({ page: 1, filters: emptyScotFilters(), sort: null })
const optionsOf = (labels) => Object.entries(labels).map(([value, label]) => ({ value, label }))
const STATE_OPTIONS = optionsOf(CALL_STATE_LABELS)
const STATUS_OPTIONS = optionsOf(STATUS_LABELS)
const CREATED_VIA_OPTIONS = optionsOf(CREATED_VIA_LABELS)
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`
const dash = <span className="text-text-muted">—</span>

// SCOT Calls — every cold lead being followed up (a person chooses which columns to see: Columns button; the default is the few a caller needs), one fixed-height row each: who, how to reach them, what they may buy, where the lead came from, when they
// were last called (and what came of it), when the next call is due, and a Log call button. Same shape as Sales FMS and the Enquiry Sheet:
//   `query` ({ page, filters, sort }) + a retry nonce + the cross-tab sync key form a request key; the loaded result remembers the key it answers, so
//   "loading" is derived and a superseded response is dropped. A new filter or sort goes back to page 1. Default order: what needs a call first.
//   After a write only THAT client's row is re-read (and the tiles); other tabs are told (Lost leads create clients, so Sheet / Sales FMS writes reach here too).
//   Messages are toasts. A click on a row opens the client's detail (call log, edit, close / reopen).
// What a user can do (the database enforces it again): canCreate add / canUpload Excel / canUpdate log calls, edit, close, reopen / canDelete (with view_all)
// delete / canManage the gear beside the Last Outcome header (the call outcomes).
// Props: canCreate, canUpload, canUpdate, canDelete, canAdmin (an administrator: scot_view_all — may back-date a call), canManage, outcomes (null while loading),
// outcomesError, onOutcomesChanged().
export default function ScotTable({ canCreate, canUpload, canUpdate, canDelete, canAdmin, canManage, outcomes, outcomesError, onOutcomesChanged }) {
  const { currentUser } = useAuth()
  const prefs = useColumnPrefs(`scot_columns_v1:${String(currentUser?.email || '').toLowerCase()}`, SCOT_COLUMNS) // which columns this person shows (this browser only)
  const show = prefs.isVisible
  const [query, setQuery] = useState(initialQuery)
  const [nonce, setNonce] = useState(0)
  const [stripKey, setStripKey] = useState(0)
  const [callsKey, setCallsKey] = useState(0) // changes when a call was logged: the open client's call log reloads
  const [result, setResult] = useState({ key: null, rows: [], total: 0, error: '' })
  const [selected, setSelected] = useState(() => new Set())
  const [toast, setToast] = useState(null)
  const [listsSeen, setListsSeen] = useState('')
  const [detail, setDetail] = useState(null) // the client row open in the modal (kept fresh after every write)
  const [logging, setLogging] = useState(null) // the client whose Log-a-call dialog is open
  const [addOpen, setAddOpen] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)
  const [manageEl, setManageEl] = useState(null)
  const manageAnchor = useMemo(() => ({ current: manageEl }), [manageEl])

  const syncKey = useLeadSync({ holdFocus: selected.size > 0 || !!detail || !!logging || addOpen || uploadOpen }) // another tab changed something, or the window came back
  const changed = useNotifyChanged() // after a successful write: every other tab becomes stale
  const requestKey = `${nonce}|${syncKey}|${JSON.stringify(query)}`

  useEffect(() => {
    if (result.key === requestKey) return undefined
    let cancelled = false
    fetchScotList({ filters: query.filters, sort: query.sort, page: query.page - 1 })
      .then(({ rows, total }) => {
        if (cancelled) return
        if (!rows.length && query.page > 1 && total > 0) {
          setQuery({ ...query, page: Math.ceil(total / SCOT_PAGE_SIZE) }) // the page we asked for no longer exists
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
  }, [requestKey, result.key, query])

  const { rows, total, error } = result
  const loading = result.key !== requestKey
  const firstLoad = result.key === null
  const tooMany = /Too many filter values/.test(error)
  const f = query.filters
  const filtersActive = countActiveFilters(SCOT_FILTER_SPEC, f) > 0
  const filterOn = (v) => (Array.isArray(v) ? v.length > 0 : !!(v && (v.from || v.to)))
  const filteredKeys = new Set(SCOT_COLUMNS.filter((c) => (SCOT_COLUMN_FILTERS[c.key] || []).some((k) => filterOn(f[k]))).map((c) => c.key)) // such a column cannot be hidden
  const canSelect = canDelete
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id))
  const someSelected = rows.some((r) => selected.has(r.id))
  // the tile that matches the current filters exactly (and nothing else), for its highlight
  const activeTile = useMemo(() => {
    const live = Object.entries(f).filter(([, v]) => (Array.isArray(v) ? v.length : v && (v.from || v.to)))
    return SCOT_TILES.find((t) => t.filters && Object.keys(t.filters).length === live.length && live.every(([k, v]) => t.filters[k] && v.length === 1 && v[0] === t.filters[k][0]))?.key || null
  }, [f])

  const changeFilter = (key, value) => setQuery((q) => ({ ...q, page: 1, filters: { ...q.filters, [key]: value } }))
  const changeSort = (key, dir) => setQuery((q) => ({ ...q, page: 1, sort: dir ? { key, dir } : null }))
  const clearFilters = () => setQuery((q) => ({ ...q, page: 1, filters: emptyScotFilters() }))
  const changePage = (p) => setQuery((q) => ({ ...q, page: p }))
  const refetch = () => {
    setStripKey((k) => k + 1)
    setNonce((x) => x + 1)
  }
  const pickTile = (tile) => setQuery((q) => ({ ...q, page: 1, filters: { ...emptyScotFilters(), ...(tile?.filters || {}) } }))
  const patchRow = (fresh) => setResult((r) => ({ ...r, rows: r.rows.map((x) => (x.id === fresh.id ? fresh : x)) }))
  const toggleOne = (id, checked) => setSelected((prev) => { const next = new Set(prev); if (checked) next.add(id); else next.delete(id); return next })
  const toggleAll = (checked) => setSelected(checked ? new Set(rows.map((r) => r.id)) : new Set())

  // After a write: re-read that one client (its state, dates and counts moved), refresh the tiles, tell the other tabs. A client that has vanished says so.
  async function afterWrite(row) {
    changed()
    setStripKey((k) => k + 1)
    try {
      const fresh = await fetchScotRow(row.id)
      if (fresh) {
        patchRow(fresh)
        setDetail((d) => (d && d.id === fresh.id ? fresh : d))
      } else {
        setDetail(null)
        setToast({ tone: 'warn', text: `${row.contact_name} is no longer in your follow-ups.` })
        setNonce((x) => x + 1)
      }
    } catch (e) {
      setToast({ tone: 'warn', text: `Saved, but the client could not be re-read (${e.message}).`, action: { label: 'Reload', onClick: refetch } })
    }
  }

  async function openById(id) {
    setAddOpen(false)
    try {
      const fresh = await fetchScotRow(id)
      if (fresh) setDetail(fresh)
      else setToast({ tone: 'warn', text: 'That client is not in your follow-ups.' })
    } catch (e) {
      setToast({ tone: 'error', text: e.message })
    }
  }

  async function handleDelete() {
    const chosen = rows.filter((r) => selected.has(r.id))
    if (!chosen.length || deleting) return
    if (!confirm(`Delete ${plural(chosen.length, 'contact', 'contacts')} from the follow-ups?\n\nThey disappear for everyone; their calls stay on file and an administrator can restore them from the database. The phone number can then be added again.`)) return
    setDeleting(true)
    setToast(null)
    try {
      const res = await deleteScotClients(chosen.map((r) => r.id))
      setToast({ tone: res.skipped ? 'warn' : 'success', text: res.skipped ? `Deleted ${res.deleted} · ${res.skipped} could not be deleted.` : `Deleted ${plural(res.deleted, 'contact', 'contacts')}.` })
      changed()
      refetch()
    } catch (e) {
      setToast({ tone: 'error', text: e.message })
    } finally {
      setDeleting(false)
    }
  }

  const sortFor = (key) => ({ kind: SCOT_SORT_KINDS[key], current: query.sort?.key === key ? query.sort.dir : null, onSort: (dir) => changeSort(key, dir) })
  const sortOnly = (key, label) => <ColumnFilter label={label} kind="none" sort={sortFor(key)} />
  const checklist = (key, label, sortKey, extra) => <ColumnFilter label={label} kind="checklist" value={f[key]} onChange={(v) => changeFilter(key, v)} sort={sortFor(sortKey)} {...extra} />
  const valuesFilter = (key, label) => checklist(key, label, key, { loadValues: () => fetchScotColumnValues(key, query.filters) })

  // ---- the call outcomes' Manage popover ----
  const manageItems = (outcomes || []).map((o) => ({ ...o, label: o.value, number: o.default_next_call_days ?? null, locked: isMeetingOutcome(o.value) })) // Meeting Scheduled is built in: the database refuses to rename or retire it
  const manageAdd = async (value) => {
    await addDropdownOption(SCOT_OUTCOME_TYPE, value)
    clearScotOutcomeCache()
    await onOutcomesChanged()
  }
  const manageSetActive = async (item, active) => {
    await setDropdownOptionActive(item.id, active)
    clearScotOutcomeCache()
    await onOutcomesChanged()
  }
  const manageSetDays = async (item, days) => {
    await setScotOutcomeNextCallDays(item.id, days)
    await onOutcomesChanged()
  }
  const NEXT_CALL_FIELD = {
    caption: 'Days until the next call is filled in automatically after this outcome. Empty = no automatic date.',
    placeholder: 'none',
    ariaLabel: 'Days until next call',
    invalidMessage: 'Enter a whole number of days from 0 to 365, or leave it empty.',
    onSet: manageSetDays,
    lockedNote: (item) => (isMeetingOutcome(item.value) ? 'meeting date is always chosen' : null),
  }
  const outcomeHeader = (
    <>
      {canManage && outcomes && (
        <button
          type="button"
          aria-label="Manage call outcomes"
          title="Manage the call outcomes"
          onClick={(e) => {
            e.stopPropagation()
            setManageEl(e.currentTarget)
            setManageOpen(true)
          }}
          className="ml-1 inline-flex align-middle items-center justify-center w-5 h-5 rounded bg-transparent border-none text-text-muted hover:text-primary"
        >
          <Icon name="settings" size={12} />
        </button>
      )}
      {sortOnly('lastOutcome', 'Last Outcome')}
    </>
  )

  const colCount = (canSelect ? 1 : 0) + 2 + SCOT_COLUMNS.filter((c) => show(c.key)).length // + the row number and the Call button

  return (
    <div>
      <ScotKpiStrip refreshKey={`${stripKey}|${syncKey}`} active={activeTile} onPick={pickTile} />

      {firstLoad && loading && <div className="text-center py-10 text-text-muted text-[13px]">Loading the follow-ups…</div>}

      {error && !loading && (
        <div className="text-center py-10 text-danger text-[13px]">
          Could not load the follow-ups: {error}
          <div className="mt-3 flex justify-center gap-2">
            {!tooMany && (
              <button type="button" onClick={refetch} className="px-3.5 py-2 rounded-lg border-[1.5px] border-danger text-danger text-[12.5px] font-bold bg-transparent">
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
            title="SCOT Calls"
            count={total}
            countLabel="contact"
            actions={
              <div className="flex items-center gap-1.5 flex-wrap justify-end">
                <ToolbarSlot show={filtersActive} width="w-[104px]">
                  <button type="button" onClick={clearFilters} tabIndex={filtersActive ? 0 : -1} className={`${TOOL} w-full`}>
                    Clear filters
                  </button>
                </ToolbarSlot>
                {canSelect && (
                  <ToolbarSlot show={selected.size > 0} width="w-[132px]">
                    <button type="button" data-role="delete" disabled={deleting || loading} onClick={handleDelete} tabIndex={selected.size > 0 ? 0 : -1} className={`${TOOL} ${DANGER} w-full`}>
                      <Icon name={deleting ? 'loader' : 'trash'} size={13} />
                      {deleting ? 'Deleting…' : `Delete ${selected.size}`}
                    </button>
                  </ToolbarSlot>
                )}
                <ColumnPicker columns={SCOT_COLUMNS} isVisible={show} onToggle={prefs.toggle} onReset={prefs.reset} filteredKeys={filteredKeys} customised={prefs.customised} />
                {canUpload && (
                  <button type="button" data-role="open-upload" onClick={() => setUploadOpen(true)} className={TOOL}>
                    <Icon name="upload" size={13} />
                    Upload Excel
                  </button>
                )}
                {canCreate && (
                  <button type="button" data-role="open-add" onClick={() => setAddOpen(true)} className={`${TOOL} ${PRIMARY}`}>
                    <Icon name="plus" size={13} />
                    Add contact
                  </button>
                )}
                <span className="inline-flex justify-end min-w-[150px]">
                  <TopPagination page={query.page} pageSize={SCOT_PAGE_SIZE} total={total} onPageChange={changePage} />
                </span>
              </div>
            }
          >
            <TableHead>
              {canSelect && <CheckboxTh checked={allSelected} indeterminate={someSelected && !allSelected} onChange={toggleAll} />}
              <Th className={COL.num}>#</Th>
              {show('name') && (
              <Th className={COL.name} filter={valuesFilter('name', 'Contact')}>
                Contact
              </Th>
              )}
              {show('phone') && (
              <Th className={COL.phone} filter={valuesFilter('phone', 'Phone')}>
                Phone
              </Th>
              )}
              {show('opportunity') && (
              <Th className={COL.opportunity} filter={valuesFilter('opportunity', 'Opportunity')}>
                Opportunity
              </Th>
              )}
              {show('email') && (
              <Th className={COL.email} filter={sortOnly('email', 'Email')}>
                Email
              </Th>
              )}
              {show('city') && (
              <Th className={COL.city} filter={valuesFilter('city', 'City')}>
                City
              </Th>
              )}
              {show('salesPerson') && (
              <Th className={COL.salesPerson} filter={valuesFilter('salesPerson', 'Sales Person')}>
                Sales Person
              </Th>
              )}
              {show('leadSource') && (
              <Th className={COL.leadSource} filter={valuesFilter('leadSource', 'Source')}>
                Source
              </Th>
              )}
              {show('remark') && (
              <Th className={COL.remark} filter={sortOnly('remark', 'Remark')}>
                Remark
              </Th>
              )}
              {show('lastCalled') && (
              <Th className={COL.lastCalled} filter={sortOnly('lastCalled', 'Last Called')}>
                Last Called
              </Th>
              )}
              {show('lastOutcome') && (
              <Th className={COL.outcome} filter={outcomeHeader}>
                Last Outcome
              </Th>
              )}
              {show('nextCall') && (
              <Th className={COL.nextCall} filter={checklist('state', 'Next Call', 'nextCall', { options: STATE_OPTIONS, nonNullable: true })}>
                Next Call
              </Th>
              )}
              {show('calls') && (
              <Th className={COL.calls} filter={sortOnly('calls', 'Calls')}>
                Calls
              </Th>
              )}
              {show('status') && (
              <Th className={COL.status} filter={checklist('status', 'Status', 'status', { options: STATUS_OPTIONS, nonNullable: true })}>
                Status
              </Th>
              )}
              {show('createdVia') && (
              <Th className={COL.createdVia} filter={checklist('createdVia', 'Added via', 'createdVia', { options: CREATED_VIA_OPTIONS, nonNullable: true })}>
                Added via
              </Th>
              )}
              <Th className={COL.action}>Call</Th>
            </TableHead>
            <tbody>
              {!rows.length ? (
                <tr>
                  <Td colSpan={colCount} align="center" className="py-10 text-text-muted">
                    {filtersActive ? (
                      <>
                        No contacts match these filters.
                        <button type="button" onClick={clearFilters} className="ml-2 text-primary font-semibold bg-transparent border-none underline">
                          Clear filters
                        </button>
                      </>
                    ) : (
                      'No follow-ups yet — a lead marked Lost appears here by itself; you can also add a contact or upload a file.'
                    )}
                  </Td>
                </tr>
              ) : (
                rows.map((r, i) => {
                  const active = r.status === 'active'
                  return (
                    <Tr key={r.id} onClick={() => setDetail(r)} title="Click row to open the client" className="h-9">
                      {canSelect && <CheckboxTd checked={selected.has(r.id)} onChange={(c) => toggleOne(r.id, c)} />}
                      <Td className={`${COL.num} tabular-nums text-text-muted`}>{(query.page - 1) * SCOT_PAGE_SIZE + i + 1}</Td>
                      {show('name') && (
                      <Td className={`${COL.name} truncate font-semibold text-text`} title={r.contact_name}>
                        {r.contact_name}
                      </Td>
                      )}
                      {show('phone') && (
                      <Td className={`${COL.phone} whitespace-nowrap`}>{r.phone}</Td>
                      )}
                      {show('opportunity') && (
                      <Td className={`${COL.opportunity} truncate`} title={r.opportunity || ''}>
                        {r.opportunity || dash}
                      </Td>
                      )}
                      {show('email') && (
                      <Td className={`${COL.email} truncate`} title={r.email || ''}>
                        {r.email || dash}
                      </Td>
                      )}
                      {show('city') && (
                      <Td className={`${COL.city} truncate`} title={r.city || ''}>
                        {r.city || dash}
                      </Td>
                      )}
                      {show('salesPerson') && (
                      <Td className={`${COL.salesPerson} truncate`} title={r.sales_person || ''}>
                        {r.sales_person || dash}
                      </Td>
                      )}
                      {show('leadSource') && (
                      <Td className={`${COL.leadSource} truncate`} title={r.lead_source || ''}>
                        {r.lead_source || dash}
                      </Td>
                      )}
                      {show('remark') && (
                      <Td className={`${COL.remark} truncate`} title={r.remark || ''}>
                        {r.remark || dash}
                      </Td>
                      )}
                      {show('lastCalled') && (
                      <Td className={`${COL.lastCalled} whitespace-nowrap tabular-nums`} title={r.last_called_at ? fmtMoment(r.last_called_at, true) : ''}>
                        {r.last_called_at ? fmtMoment(r.last_called_at) : dash}
                      </Td>
                      )}
                      {show('lastOutcome') && (
                      <Td className={`${COL.outcome} truncate`} title={r.last_outcome || ''}>
                        {r.last_outcome || dash}
                      </Td>
                      )}
                      {show('nextCall') && (
                      <Td className={`${COL.nextCall} whitespace-nowrap`} title={r.next_call_date ? `Next call ${fmtDay(r.next_call_date, true)}` : ''}>
                        <span className="flex items-center gap-1.5">
                          <StatusBadge tone={CALL_STATE_TONE[r.call_state] || 'neutral'}>{CALL_STATE_LABELS[r.call_state] || r.call_state}</StatusBadge>
                          <span className="text-[12px] tabular-nums text-text-muted truncate">
                            {active && r.days_overdue > 0 ? `${r.days_overdue}d` : active && r.next_call_date ? fmtDay(r.next_call_date) : ''}
                          </span>
                        </span>
                      </Td>
                      )}
                      {show('calls') && (
                      <Td className={`${COL.calls} tabular-nums`}>{r.call_count}</Td>
                      )}
                      {show('status') && (
                      <Td className={`${COL.status} whitespace-nowrap`}>{STATUS_LABELS[r.status] || r.status}</Td>
                      )}
                      {show('createdVia') && (
                      <Td className={`${COL.createdVia} truncate`} title={r.lost_count > 1 ? `Lost ${r.lost_count} times` : ''}>
                        {CREATED_VIA_LABELS[r.created_via] || r.created_via}
                      </Td>
                      )}
                      <Td className={`${COL.action} whitespace-nowrap`}>
                        {canUpdate && active ? (
                          <button
                            type="button"
                            data-role="log-call"
                            aria-label={`Log call ${r.contact_name}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              setLogging(r)
                            }}
                            className="inline-flex items-center h-5 px-2 rounded border border-border bg-transparent text-[11px] font-semibold text-text-muted hover:bg-surface-2 hover:text-text"
                          >
                            Log call
                          </button>
                        ) : (
                          dash
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

      {detail && (
        <ScotClientModal key={`client-${detail.id}`} row={detail} canUpdate={canUpdate} reloadKey={callsKey} onClose={() => setDetail(null)} onLogCall={setLogging} onChanged={afterWrite} notify={setToast} />
      )}
      {logging && (
        <ScotLogCallDialog
          key={`call-${logging.id}`}
          row={logging}
          outcomes={outcomes}
          canAdmin={canAdmin}
          onClose={() => setLogging(null)}
          onDone={(row) => {
            setLogging(null)
            setCallsKey((k) => k + 1)
            afterWrite(row)
          }}
          notify={setToast}
        />
      )}
      {addOpen && (
        <ScotAddDialog
          onClose={() => setAddOpen(false)}
          onAdded={(id) => {
            setAddOpen(false)
            changed()
            setQuery((q) => ({ ...q, page: 1 }))
            refetch()
            openById(id)
          }}
          onOpenExisting={openById}
          notify={setToast}
        />
      )}
      {uploadOpen && (
        <ScotUploadDialog
          onClose={() => setUploadOpen(false)}
          onImported={() => {
            setUploadOpen(false)
            changed()
            setQuery((q) => ({ ...q, page: 1 }))
            refetch()
          }}
          notify={setToast}
        />
      )}

      <ManageListPopover anchorRef={manageAnchor} open={manageOpen} onClose={() => setManageOpen(false)} label="call outcomes" items={manageItems} onAdd={manageAdd} onSetActive={manageSetActive} numberField={NEXT_CALL_FIELD} width={400} />

      <Toast
        toast={toast ?? (outcomesError && outcomesError !== listsSeen ? { tone: 'warn', text: `Couldn't load the call outcomes (${outcomesError}) — logging a call is unavailable until they load.`, action: { label: 'Retry', onClick: onOutcomesChanged } } : null)}
        onDismiss={() => (toast ? setToast(null) : setListsSeen(outcomesError))}
      />
    </div>
  )
}
