import { useEffect, useMemo, useState } from 'react'
import {
  FMS_FILTER_SPEC,
  FMS_PAGE_SIZE,
  FMS_SORT_KINDS,
  PIPELINE_STATE_LABELS,
  PIPELINE_STATE_TONE,
  STAGES,
  emptyFmsFilters,
  fetchSalesFms,
  fetchSalesFmsColumnValues,
  fetchSalesFmsRow,
  isClosed,
  reasonOptions,
  setNegotiationActual,
  setReasonCompletes,
  setStageReason,
  stageLabel,
} from '../../../lib/salesFms'
import { addDropdownOption, setDropdownOptionActive } from '../../../lib/enquiries'
import { fmtHours, fmtMoment, inputToMoment, momentToInput } from '../../../lib/fmsFormat'
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
import { InlineSelectCell, InlineTextCell } from '../../shared/table/InlineCells'
import ToolbarSlot from '../../shared/table/ToolbarSlot'
import TopPagination from '../../shared/table/TopPagination'
import Toast from '../../shared/Toast'
import { useLeadSync, useNotifyChanged } from '../leadcapture/leadSync'
import { COL } from './fmsColumns'
import FmsCloseDialog from './FmsCloseDialog'
import FmsKpiStrip from './FmsKpiStrip'
import FmsLeadModal from './FmsLeadModal'
import FmsStageCell from './FmsStageCell'

const TOOL = 'inline-flex items-center justify-center gap-1.5 h-7 min-w-7 px-2 rounded-lg border border-border bg-transparent text-text-muted text-[12px] font-semibold hover:bg-surface-2 hover:text-text disabled:opacity-50'
// The Status cell's tooltip carries what the retired columns used to show: the current stage, how long it is overdue, the lead's age.
const statusTitle = (r) =>
  [
    PIPELINE_STATE_LABELS[r.pipeline_state] || r.pipeline_state,
    r.current_stage ? `now at ${stageLabel(r.current_stage)}` : null,
    r.hours_overdue > 0 ? `overdue ${fmtHours(r.hours_overdue)}` : null,
    `age ${fmtHours(r.age_hours)}`,
  ]
    .filter(Boolean)
    .join(' · ')
const initialQuery = () => ({ page: 1, filters: emptyFmsFilters(), sort: null })
const STATE_OPTIONS = Object.entries(PIPELINE_STATE_LABELS).map(([value, label]) => ({ value, label }))
const REASON_RULES = [
  { value: 'yes', label: 'Moves stage on' },
  { value: 'no', label: 'Note only' },
]
const REASON_CAPTION = "Moves stage on = picking it stamps the stage's actual time and starts the next stage's clock · Note only = just a logged explanation (the stage stays open)."

// Sales FMS — every enquiry that has been sent to FMS, one fixed-height row each: its four stages at a glance (what is done, what is due, what is
// overdue), a Reason dropdown for each of the first three stages, the negotiation time, and the closure. Same shape as the Enquiry Capture Sheet:
// `query` ({ page, filters, sort }) + a retry nonce form a request key; the loaded result remembers the key it answers, so "loading" is derived and a
// superseded response is dropped. Every column sorts and filters for everyone (the rows are already limited to what the viewer may see). The default
// order is the most overdue first. Messages are toasts.
//
// What a user can do HERE (the database enforces it, this only decides what to draw):
//   canUpdate  pick a stage's Reason (a completing one stamps the actual and plans the next stage), enter the negotiation time, Close a lead
//   canAdmin   additionally correct any stage and reopen a closed lead (in the detail view)
//   canManage  the gear beside each Reason header: add / retire the reasons and say which ones move the stage on
// After every write only THAT lead's row is re-read (its stamps, planned times and state all change) and the strip refreshes.
// A closed lead takes no more stage changes. Props: canUpdate, canAdmin, canManage, reasons (null while loading), reasonsError, onReasonsChanged().
export default function SalesFmsTable({ canUpdate, canAdmin, canManage, reasons, reasonsError, onReasonsChanged }) {
  const [query, setQuery] = useState(initialQuery)
  const [nonce, setNonce] = useState(0)
  const [stripKey, setStripKey] = useState(0)
  const [result, setResult] = useState({ key: null, rows: [], total: 0, error: '' })
  const [toast, setToast] = useState(null)
  const [listsSeen, setListsSeen] = useState('')
  const [detailId, setDetailId] = useState(null)
  const [closing, setClosing] = useState(null) // the list row being closed
  const [manageStage, setManageStage] = useState(null) // 'first_call' | 'demo' | 'quotation' | null
  const [manageEl, setManageEl] = useState(null)
  const manageAnchor = useMemo(() => ({ current: manageEl }), [manageEl]) // PortalPopover wants a ref-shaped anchor

  const syncKey = useLeadSync({ holdFocus: !!detailId || !!closing }) // another tab changed something, or the window came back
  const changed = useNotifyChanged() // after a successful write: every other tab becomes stale
  const requestKey = `${nonce}|${syncKey}|${JSON.stringify(query)}`

  useEffect(() => {
    if (result.key === requestKey) return undefined
    let cancelled = false
    fetchSalesFms({ filters: query.filters, sort: query.sort, page: query.page - 1 })
      .then(({ rows, total }) => {
        if (cancelled) return
        if (!rows.length && query.page > 1 && total > 0) {
          setQuery({ ...query, page: Math.ceil(total / FMS_PAGE_SIZE) }) // the page we asked for no longer exists
          return
        }
        setResult({ key: requestKey, rows, total, error: '' })
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
  const filtersActive = countActiveFilters(FMS_FILTER_SPEC, query.filters) > 0
  const openRow = detailId ? rows.find((r) => r.enquiry_id === detailId) || null : null

  const changeFilter = (key, value) => setQuery((q) => ({ ...q, page: 1, filters: { ...q.filters, [key]: value } }))
  const changeSort = (key, dir) => setQuery((q) => ({ ...q, page: 1, sort: dir ? { key, dir } : null }))
  const clearFilters = () => setQuery((q) => ({ ...q, page: 1, filters: emptyFmsFilters() }))
  const changePage = (p) => setQuery((q) => ({ ...q, page: p }))
  const refetch = () => {
    setStripKey((k) => k + 1)
    setNonce((x) => x + 1)
  }
  const pickState = (state) => setQuery((q) => ({ ...q, page: 1, filters: { ...q.filters, state: state && q.filters.state?.length === 1 && q.filters.state[0] === state ? [] : state ? [state] : [] } }))
  const patchRow = (fresh) => setResult((r) => ({ ...r, rows: r.rows.map((x) => (x.enquiry_id === fresh.enquiry_id ? fresh : x)) }))

  // After a write: re-read that one lead (its stamps, plans and state moved) and refresh the strip. A lead that has vanished (deleted meanwhile) says so.
  async function afterWrite(row) {
    changed()
    setStripKey((k) => k + 1)
    try {
      const fresh = await fetchSalesFmsRow(row.enquiry_id)
      if (fresh) patchRow(fresh)
      else {
        setToast({ tone: 'warn', text: `${row.name} is no longer in the pipeline.` })
        setNonce((x) => x + 1)
      }
    } catch (e) {
      setToast({ tone: 'warn', text: `Saved, but the lead could not be re-read (${e.message}).`, action: { label: 'Reload', onClick: refetch } })
    }
  }
  // Any inline-cell failure also lands here (the cell itself only has room for a tint + tooltip). A lost race offers a Reload.
  function handleCellError(e) {
    setToast({ tone: 'error', text: e.message, action: e.code === 'conflict' || e.code === 'gone' ? { label: 'Reload', onClick: refetch } : undefined })
  }

  const f = query.filters
  const sortFor = (key) => ({ kind: FMS_SORT_KINDS[key], current: query.sort?.key === key ? query.sort.dir : null, onSort: (dir) => changeSort(key, dir) })
  const sortOnly = (key, label) => <ColumnFilter label={label} kind="none" sort={sortFor(key)} />
  const checklist = (key, label, extra) => <ColumnFilter label={label} kind="checklist" value={f[key]} onChange={(v) => changeFilter(key, v)} sort={sortFor(key)} {...extra} />
  const valuesFilter = (key, label) => checklist(key, label, { loadValues: () => fetchSalesFmsColumnValues(key, query.filters) })

  // ---- the reasons' Manage popover (one list per stage) ----
  const manage = manageStage ? STAGES.find((s) => s.key === manageStage) : null
  const manageItems = manage ? (reasons?.[manage.key] || []).map((o) => ({ ...o, label: o.value, rule: o.completes_stage ? 'yes' : 'no' })) : []
  const manageAdd = async (value) => {
    await addDropdownOption(manage.reasonType, value)
    await onReasonsChanged()
  }
  const manageSetActive = async (item, active) => {
    await setDropdownOptionActive(item.id, active)
    await onReasonsChanged()
  }
  const manageSetRule = async (item, rule) => {
    await setReasonCompletes(item.id, rule === 'yes')
    await onReasonsChanged()
  }
  const reasonHeader = (stage, key) => (
    <>
      {canManage && reasons && (
        <button
          type="button"
          aria-label={`Manage ${stage.label} reasons`}
          title={`Manage the ${stage.label} reasons`}
          onClick={(e) => {
            e.stopPropagation()
            setManageEl(e.currentTarget)
            setManageStage(stage.key)
          }}
          className="ml-1 inline-flex align-middle items-center justify-center w-5 h-5 rounded bg-transparent border-none text-text-muted hover:text-primary"
        >
          <Icon name="settings" size={12} />
        </button>
      )}
      {sortOnly(key, 'Reason')}
    </>
  )

  const colCount = 16

  return (
    <div>
      <FmsKpiStrip refreshKey={`${stripKey}|${syncKey}`} active={f.state} onPick={pickState} />

      {firstLoad && loading && <div className="text-center py-10 text-text-muted text-[13px]">Loading the pipeline…</div>}

      {error && !loading && (
        <div className="text-center py-10 text-danger text-[13px]">
          Could not load the pipeline: {error}
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
            title="Sales FMS"
            count={total}
            countLabel="lead"
            actions={
              <div className="flex items-center gap-1.5 flex-wrap justify-end">
                <ToolbarSlot show={filtersActive} width="w-[104px]">
                  <button type="button" onClick={clearFilters} tabIndex={filtersActive ? 0 : -1} className={`${TOOL} w-full`}>
                    Clear filters
                  </button>
                </ToolbarSlot>
                <span className="inline-flex justify-end min-w-[150px]">
                  <TopPagination page={query.page} pageSize={FMS_PAGE_SIZE} total={total} onPageChange={changePage} />
                </span>
              </div>
            }
          >
            <TableHead>
              <Th className={COL.num}>#</Th>
              <Th className={COL.name} filter={valuesFilter('name', 'Name')}>
                Name
              </Th>
              <Th className={COL.company} filter={valuesFilter('company', 'Company')}>
                Company
              </Th>
              <Th className={COL.phone} filter={valuesFilter('phone', 'Phone')}>
                Phone
              </Th>
              <Th className={COL.salesPerson} filter={valuesFilter('salesPerson', 'Sales Person')}>
                Sales Person
              </Th>
              <Th className={COL.entered} filter={checklist('entered', 'Entered', { kind: 'dateRange' })}>
                Entered
              </Th>
              {STAGES.map((s) => [
                <Th key={s.key} className={COL.stage} filter={sortOnly(s.short, s.label)}>
                  {s.label}
                </Th>,
                s.hasReason ? (
                  <Th key={`${s.key}-r`} className={COL.reason} filter={reasonHeader(s, `${s.short}Reason`)}>
                    Reason
                  </Th>
                ) : (
                  <Th key={`${s.key}-t`} className={COL.setTime}>
                    Negotiation time
                  </Th>
                ),
              ])}
              <Th className={COL.closure} filter={sortOnly('closure', 'Closure')}>
                Closure
              </Th>
              <Th className={COL.status} filter={checklist('state', 'Status', { options: STATE_OPTIONS, nonNullable: true })}>
                Status
              </Th>
            </TableHead>
            <tbody>
              {!rows.length ? (
                <tr>
                  <Td colSpan={colCount} align="center" className="py-10 text-text-muted">
                    {filtersActive ? (
                      <>
                        No leads match these filters.
                        <button type="button" onClick={clearFilters} className="ml-2 text-primary font-semibold bg-transparent border-none underline">
                          Clear filters
                        </button>
                      </>
                    ) : (
                      'No leads in the pipeline yet — an enquiry appears here once it is sent to FMS.'
                    )}
                  </Td>
                </tr>
              ) : (
                rows.map((r, i) => {
                  const closed = isClosed(r)
                  const editable = canUpdate && !closed
                  return (
                    <Tr key={r.enquiry_id} onClick={() => setDetailId(r.enquiry_id)} title="Click row to view the pipeline" className="h-9">
                      <Td className={`${COL.num} text-center`}>
                        <button type="button" aria-label={`Pipeline for ${r.name}`} title="View the pipeline" className="inline-flex align-middle items-center justify-center min-w-5 h-5 px-0.5 rounded bg-transparent border-none text-[11.5px] tabular-nums text-text-muted hover:text-primary hover:underline">
                          {(query.page - 1) * FMS_PAGE_SIZE + i + 1}
                        </button>
                      </Td>
                      <Td className={`${COL.name} truncate font-semibold text-text`} title={r.name}>
                        {r.name}
                      </Td>
                      <Td className={`${COL.company} truncate`} title={r.company_name || ''}>
                        {r.company_name || <span className="text-text-muted">—</span>}
                      </Td>
                      <Td className={`${COL.phone} whitespace-nowrap`}>{r.phone}</Td>
                      <Td className={`${COL.salesPerson} truncate`} title={r.sales_person_accountable || ''}>
                        {r.sales_person_accountable || <span className="text-text-muted">—</span>}
                      </Td>
                      <Td className={`${COL.entered} whitespace-nowrap tabular-nums`} title={`Entered ${fmtMoment(r.fc_planned, true)}`}>
                        {fmtMoment(r.fc_planned)}
                      </Td>
                      {STAGES.map((s, k) => [
                        <FmsStageCell key={s.key} row={r} index={k} className={COL.stage} />,
                        s.hasReason ? (
                          <InlineSelectCell
                            key={`${s.key}-r`}
                            value={r[`${s.short}_reason`] || ''}
                            options={reasonOptions(reasons, s.key)}
                            allowBlank
                            blankLabel="—"
                            editable={editable && !!reasons}
                            onSave={async (v) => {
                              await setStageReason(r.enquiry_id, s.key, v, r[`${s.short}_stamp`])
                              await afterWrite(r)
                            }}
                            onError={handleCellError}
                            ariaLabel={`${s.label} reason, ${r.name}`}
                            className={COL.reason}
                          />
                        ) : editable ? (
                          <InlineTextCell
                            key={`${s.key}-t`}
                            type="datetime-local"
                            value={momentToInput(r.ng_actual)}
                            validate={(v) => (inputToMoment(v) ? null : 'Enter a date and time.')}
                            onSave={async (v) => {
                              await setNegotiationActual(r.enquiry_id, inputToMoment(v), r.ng_stamp)
                              await afterWrite(r)
                            }}
                            onError={handleCellError}
                            ariaLabel={`Negotiation time, ${r.name}`}
                            className={COL.setTime}
                          />
                        ) : (
                          <Td key={`${s.key}-t`} className={`${COL.setTime} whitespace-nowrap tabular-nums`}>
                            {r.ng_actual ? fmtMoment(r.ng_actual) : <span className="text-text-muted">—</span>}
                          </Td>
                        ),
                      ])}
                      <Td className={`${COL.closure} whitespace-nowrap`} title={closed ? [r.outcome === 'won' ? 'Won' : 'Lost', fmtMoment(r.closed_at, true), r.so_number && `SO ${r.so_number}`, r.closure_comment].filter(Boolean).join(' · ') : ''}>
                        {closed ? (
                          <span className={`flex items-center gap-1 h-5 text-[12px] ${r.outcome === 'won' ? 'text-[#16A34A] font-semibold' : 'text-text-muted'}`}>
                            {r.outcome === 'won' && <Icon name="check" size={11} className="shrink-0" />}
                            <span className="truncate">
                              {r.outcome === 'won' ? 'Won' : 'Lost'} · {fmtMoment(r.closed_at)}
                            </span>
                          </span>
                        ) : canUpdate ? (
                          <button
                            type="button"
                            data-role="close"
                            aria-label={`Close ${r.name}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              setClosing(r)
                            }}
                            className="inline-flex items-center h-5 px-2 rounded border border-border bg-transparent text-[11px] font-semibold text-text-muted hover:bg-surface-2 hover:text-text"
                          >
                            Close lead
                          </button>
                        ) : (
                          <span className="text-text-muted">—</span>
                        )}
                      </Td>
                      <Td className={`${COL.status} whitespace-nowrap`} title={statusTitle(r)}>
                        <StatusBadge tone={PIPELINE_STATE_TONE[r.pipeline_state] || 'neutral'}>{PIPELINE_STATE_LABELS[r.pipeline_state] || r.pipeline_state}</StatusBadge>
                      </Td>
                    </Tr>
                  )
                })
              )}
            </tbody>
          </Table>
        </div>
      )}

      {openRow && <FmsLeadModal key={openRow.enquiry_id} row={openRow} reasons={reasons} canUpdate={canUpdate} canAdmin={canAdmin} onClose={() => setDetailId(null)} onChanged={afterWrite} onClosing={setClosing} notify={setToast} />}
      {closing && <FmsCloseDialog key={closing.enquiry_id} row={closing} canAdmin={canAdmin} onClose={() => setClosing(null)} onDone={(row) => { setClosing(null); afterWrite(row) }} notify={setToast} />}

      <ManageListPopover
        anchorRef={manageAnchor}
        open={!!manage}
        onClose={() => setManageStage(null)}
        label={manage ? `${manage.label} reasons` : ''}
        items={manageItems}
        onAdd={manageAdd}
        onSetActive={manageSetActive}
        rules={REASON_RULES}
        onSetRule={manageSetRule}
        ruleCaption={REASON_CAPTION}
        width={400}
      />

      <Toast
        toast={toast ?? (reasonsError && reasonsError !== listsSeen ? { tone: 'warn', text: `Couldn't load the reasons (${reasonsError}) — the Reason cells stay read-only.`, action: { label: 'Retry', onClick: onReasonsChanged } } : null)}
        onDismiss={() => (toast ? setToast(null) : setListsSeen(reasonsError))}
      />
    </div>
  )
}
