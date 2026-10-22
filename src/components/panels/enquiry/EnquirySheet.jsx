import { useEffect, useMemo, useRef, useState } from 'react'
import { useLeadCaptureAccess } from '../../../context/LeadCaptureAccessContext'
import {
  CHANNEL_LABELS,
  CLIENT_TYPE_OPTIONS,
  DROPDOWN_TYPES,
  ENQUIRY_FILTER_SPEC,
  ENQUIRY_PAGE_SIZE,
  ENQUIRY_SORT_KINDS,
  FMS_FILTER_OPTIONS,
  isBuiltinStatus,
  FMS_RULE_OPTIONS,
  addDropdownOption,
  deleteEnquiries,
  downloadEnquiryTemplate,
  emptyEnquiryFilters,
  fetchEnquiries,
  fetchEnquiry,
  fetchEnquiryColumnValues,
  neverSendStatusLabels,
  sendEnquiriesToFms,
  setDropdownOptionActive,
  setStatusFmsRule,
  statusFilterOptions,
  statusLabel,
} from '../../../lib/enquiries'
import { canDeleteEnquiries, canDeleteSentEnquiries, canManageEnquiryDropdowns, canSendEnquiriesToFms } from '../../../lib/enquiryPermissions'
import { countActiveFilters, isFilterActive } from '../../../lib/tableFilters'
import Icon from '../../shared/Icon'
import Table from '../../shared/table/Table'
import TableHead from '../../shared/table/TableHead'
import Th from '../../shared/table/Th'
import Td from '../../shared/table/Td'
import { CheckboxTh } from '../../shared/table/CheckboxCell'
import ColumnFilter from '../../shared/table/ColumnFilter'
import ToolbarSlot from '../../shared/table/ToolbarSlot'
import TopPagination from '../../shared/table/TopPagination'
import ManageListPopover from '../../shared/ManageListPopover'
import OverlayShell from '../../shared/OverlayShell'
import Toast from '../../shared/Toast'
import EnquiryDetailModal from './EnquiryDetailModal'
import EnquiryDraftRow from './EnquiryDraftRow'
import EnquiryRow from './EnquiryRow'
import EnquiryUploadTab from './EnquiryUploadTab'
import { useLeadSync, useNotifyChanged } from '../leadcapture/leadSync'
import { COL } from './enquirySheetLayout'

const TOOL = 'inline-flex items-center justify-center gap-1.5 h-7 min-w-7 px-2 rounded-lg border border-border bg-transparent text-text-muted text-[12px] font-semibold hover:bg-surface-2 hover:text-text disabled:opacity-50'
const PRIMARY = '!bg-primary !text-white !border-primary'
const DANGER = '!text-danger !border-danger hover:!bg-danger-tint'
const initialQuery = () => ({ page: 1, filters: emptyEnquiryFilters(), sort: null })
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`
// The columns backed by a managed list: `label` names the list in its popover, `manageLabel` is the link in a filter menu.
const MANAGED = {
  source: { label: 'Source', manageLabel: 'Manage source values', type: DROPDOWN_TYPES.SOURCE },
  sales_person: { label: 'Sales Person', manageLabel: 'Manage sales person values', type: DROPDOWN_TYPES.SALES_PERSON },
  status: { label: 'Status', manageLabel: 'Manage status values', type: DROPDOWN_TYPES.STATUS },
  requirement: { label: 'Products', manageLabel: 'Manage products', type: DROPDOWN_TYPES.PRODUCT },
}

// A managed list as filter options. Admins also receive RETIRED values (RLS), so an old enquiry can still be
// filtered by a source / person that has since been retired — flagged with a hint.
const listFilterOptions = (list) => (list || []).map((o) => ({ value: o.value, label: o.value, hint: o.is_active ? undefined : 'retired' }))
const CHANNEL_FILTER_OPTIONS = Object.entries(CHANNEL_LABELS).map(([value, label]) => ({ value, label }))

// What a Send to FMS call reports. The RPC is atomic and returns { requested, sent, skipped, skipped_never }
// ("skipped" = already sent, or not the caller's, or — skipped_never — a status that is never sent, e.g. Junk; those are skipped, not errors).
// Only a clean success fades by itself; a partial outcome keeps its reason on screen until dismissed (see Toast).
// `neverNames`: the display names of the never-send statuses, so the message says "skipped (Junk)".
function sendOutcome({ requested, sent, skipped, skipped_never: never = 0 }, neverNames = []) {
  const other = skipped - never
  const why = []
  if (never > 0) why.push(`${never} skipped (${neverNames.length ? neverNames.join(', ') : 'never-send status'})`)
  if (other > 0) why.push(`${other} ${other === 1 ? 'was' : 'were'} already sent`)
  if (sent === 0) return { tone: 'warn', text: never > 0 ? `Nothing sent — ${why.join(' · ')}.` : `Nothing sent — ${requested === 1 ? 'it was' : `all ${requested} were`} already sent.` }
  if (skipped > 0) return { tone: 'warn', text: never > 0 ? `Sent ${sent} · ${why.join(' · ')}.` : `Sent ${sent} · ${skipped} ${skipped === 1 ? 'was' : 'were'} already sent.` }
  return { tone: 'success', text: `Sent ${plural(sent, 'enquiry', 'enquiries')} to FMS.` }
}

// What a Delete call reports (same shape idea as Send: { requested, deleted, skipped, deleted_sent, entries_deleted }). Skipped
// rows were already deleted, not the caller's — or, without enquiry_delete_sent, already sent. A partial result keeps its reason
// on screen until dismissed. The sent / Field Sales counts are said out loud: those deletions reach beyond the sheet.
function deleteOutcome({ requested, deleted, skipped, deleted_sent: sentCount = 0, entries_deleted: entries = 0 }, canDeleteSent) {
  const why = canDeleteSent ? 'already deleted or not yours' : 'already sent, already deleted, or not yours'
  const extra = sentCount > 0 ? ` (${sentCount} already sent to FMS${entries > 0 ? `, with ${plural(entries, 'Field Sales entry', 'Field Sales entries')}` : ''})` : ''
  if (deleted === 0) return { tone: 'warn', text: `Nothing deleted — ${requested === 1 ? 'it was' : `all ${requested} were`} ${why}.` }
  if (skipped > 0) return { tone: 'warn', text: `Deleted ${deleted}${extra} · ${skipped} skipped (${why}).` }
  return { tone: 'success', text: `Deleted ${plural(deleted, 'enquiry', 'enquiries')}${extra}.` }
}

// The confirmation before a Delete. A selection that includes SENT rows says what else goes with them — the pipeline, the Field
// Sales entry they came from, the MeCa figures (including past periods') — because that reaches well beyond this sheet.
function deleteConfirmText(chosen, canDeleteSent) {
  const n = chosen.length
  const them = n === 1 ? 'it' : 'them'
  const restore = `It can't be undone from the portal — only an administrator can restore ${them} from the database.`
  const sent = chosen.filter((r) => r.sent_to_fms_at)
  if (!sent.length) return `Delete ${plural(n, 'enquiry', 'enquiries')}?\n\nThis removes ${them} from the sheet for everyone. ${restore}${canDeleteSent ? '' : ' Enquiries already sent to FMS can\'t be deleted.'}`
  const fromFieldSales = sent.filter((r) => r.entry_channel === 'field_sales_form').length
  const fromScot = sent.filter((r) => r.entry_channel === 'scot_call').length
  return [
    `Delete ${plural(n, 'enquiry', 'enquiries')} — ${sent.length === n ? (n === 1 ? 'already sent to FMS' : 'all already sent to FMS') : `${sent.length} of them already sent to FMS`}?`,
    '',
    `This removes ${them} from the sheet for everyone. Deleting a SENT enquiry also removes:`,
    '  •  its pipeline in Sales FMS (stage dates, amounts, remarks)',
    ...(fromFieldSales ? [`  •  the Field Sales Form ${fromFieldSales === 1 ? 'entry' : 'entries'} it was pushed from (${fromFieldSales} of the selected)`] : []),
    ...(fromScot ? [`  •  its place in the pipeline for ${fromScot === 1 ? 'a SCOT Calls contact' : `${fromScot} SCOT Calls contacts`} (the contact stays in SCOT Calls and can be put back by logging Meeting Scheduled again)`] : []),
    '  •  its meetings and sales from Sales Rep MeCa — the numbers of PAST periods change too',
    '',
    restore,
  ].join('\n')
}

// A settings icon in a Source / Sales Person header for a user who may manage the lists but has no column filters
// (enquiry_manage_dropdowns without enquiry_view_all) — otherwise that permission would be unreachable.
function ManageButton({ label, onOpen }) {
  return (
    <button
      type="button"
      aria-label={`Manage ${label}`}
      aria-haspopup="dialog"
      title={`Manage ${label} values`}
      onClick={(e) => {
        e.stopPropagation()
        onOpen(e.currentTarget)
      }}
      className="ml-1 inline-flex items-center justify-center w-[14px] h-[14px] align-middle rounded-sm bg-transparent border-none p-0 normal-case font-normal text-text-muted/70 hover:text-text-muted"
    >
      <Icon name="settings" size={12} />
    </button>
  )
}

// The Enquiry Capture Sheet: ONE Excel-density table that replaces the old tab bar, filter bar, Add Entry form
// and read-only list. Two shapes, decided by `admin` (enquiry_view_all):
//   - admin: every row, per-column header filters (Excel-style value checklists), Channel column, Bulk Upload, and
//     (with enquiry_assign_fms) checkboxes + Send to FMS.
//   - normal: the user's OWN rows (RLS already returns only those — never client-filtered), no filters.
// EVERY column sorts for everyone (Excel-style, in each header's menu). Everything is edited in place (EnquiryRow) and new
// entries are typed into rows at the top (EnquiryDraftRow); the small toolbar in the table header holds New Row, Upload /
// Template (admin with create), the Send and Clear controls when relevant, and paging. Sent rows are locked. The expand
// icon opens the read-only detail view (the fallback for truncated text).
//
// Data flow: `query` ({ page, filters, sort }) + a retry nonce form a request key. The loaded `result` remembers which
// key it answers, so "loading" is simply result.key !== requestKey — derived, never a setState in an effect — and a
// response for a superseded key is dropped by the effect's cleanup. A new filter or sort goes back to page 1. Saving a
// cell patches the local row (no refetch); a new entry or an import refetches page 1. Selection is per page and cleared
// whenever a result arrives.
// Layout stability (a standing rule for this module): messages are TOASTS (they overlay the page, they cannot push a
// control), and the toolbar's conditional controls sit in fixed slots, invisible when not applicable.
//
// Props: admin; canCreate; dropdowns (the managed lists, null while loading), dropdownsError,
// onDropdownsChanged() (force-refetch them — resolves, never rejects).
export default function EnquirySheet({ admin, canCreate, dropdowns, dropdownsError, onDropdownsChanged }) {
  const { permissions } = useLeadCaptureAccess()
  const canSend = admin && canSendEnquiriesToFms(permissions)
  const canDelete = canDeleteEnquiries(permissions) // own unsent rows on its own; anyone's with view_all (the database decides)
  const canDeleteSent = canDeleteSentEnquiries(permissions) // additive: SENT rows too (the database decides again)
  const canSelect = canSend || canDelete // the checkbox column serves both Send and Delete
  const canManage = canManageEnquiryDropdowns(permissions)
  const canUpload = admin && canCreate // Bulk Upload RLS needs create AND view_all
  const canEdit = canCreate || admin // a view-only user sees the sheet read-only (an admin may edit any unsent row)

  const [query, setQuery] = useState(initialQuery)
  const [nonce, setNonce] = useState(0)
  const [result, setResult] = useState({ key: null, rows: [], total: 0, error: '' })
  const [selected, setSelected] = useState(() => new Set())
  const [toast, setToast] = useState(null)
  const [listsSeen, setListsSeen] = useState('') // the lists-failed warning the user already dismissed
  const [sending, setSending] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [detailId, setDetailId] = useState(null)
  const [drafts, setDrafts] = useState([])
  const [uploadOpen, setUploadOpen] = useState(false)
  const [manageKey, setManageKey] = useState(null) // 'source' | 'sales_person' | null
  const [manageEl, setManageEl] = useState(null) // the header button the manage popover hangs from
  const manageAnchor = useMemo(() => ({ current: manageEl }), [manageEl]) // PortalPopover wants a ref-shaped anchor
  const draftSeq = useRef(0)
  const busyRef = useRef(false) // synchronous double-click guard for Send and Delete (state alone lags a render)

  const syncKey = useLeadSync({ holdFocus: selected.size > 0 || drafts.length > 0 || !!detailId || uploadOpen }) // another tab changed something, or the window came back
  const changed = useNotifyChanged() // after a successful write: every other tab becomes stale
  const requestKey = `${nonce}|${syncKey}|${JSON.stringify(query)}`

  useEffect(() => {
    if (result.key === requestKey) return
    let cancelled = false
    fetchEnquiries({ filters: admin ? query.filters : {}, sort: query.sort, page: query.page - 1 })
      .then(({ rows, total }) => {
        if (cancelled) return
        // The page we asked for no longer exists (e.g. sending rows removed them from a "Not sent" view) —
        // step back to the new last page instead of showing an empty one.
        if (!rows.length && query.page > 1 && total > 0) {
          setQuery({ ...query, page: Math.ceil(total / ENQUIRY_PAGE_SIZE) })
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
  // an unsent row can be sent or deleted; a SENT row can only be deleted, and only with enquiry_delete_sent
  const selectable = canSelect ? rows.filter((r) => !r.sent_to_fms_at || canDeleteSent) : []
  const sendIds = rows.filter((r) => selected.has(r.id) && !r.sent_to_fms_at).map((r) => r.id) // Send acts on the UNSENT part of the selection
  const allSelected = selectable.length > 0 && selectable.every((r) => selected.has(r.id))
  const someSelected = selectable.some((r) => selected.has(r.id))
  const detail = rows.find((r) => r.id === detailId) || null
  const filtersActive = countActiveFilters(ENQUIRY_FILTER_SPEC, query.filters) > 0 || isFilterActive('checklist', query.filters.fms)
  const colCount = 12 + (canSelect ? 1 : 0) + (admin ? 1 : 0)

  const changeFilter = (key, value) => setQuery((q) => ({ ...q, page: 1, filters: { ...q.filters, [key]: value } }))
  const changeSort = (key, dir) => setQuery((q) => ({ ...q, page: 1, sort: dir ? { key, dir } : null }))
  const clearFilters = () => setQuery((q) => ({ ...q, page: 1, filters: emptyEnquiryFilters() }))
  const changePage = (p) => setQuery((q) => ({ ...q, page: p }))
  const reload = () => {
    setToast(null)
    setNonce((x) => x + 1)
  }
  const showFirstPage = () => {
    setQuery((q) => ({ ...q, page: 1 }))
    setNonce((x) => x + 1)
  }

  function toggleOne(id, checked) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }
  const toggleAll = (checked) => setSelected(checked ? new Set(selectable.map((r) => r.id)) : new Set())

  async function handleSend() {
    const ids = sendIds
    if (!ids.length || busyRef.current) return
    const n = ids.length
    const them = n === 1 ? 'it' : 'them'
    if (!confirm(`Send ${plural(n, 'enquiry', 'enquiries')} to FMS?\n\nThis marks ${them} as sent, creates the pipeline stages, and locks ${them} from editing. It can't be undone from the portal.`)) return
    busyRef.current = true
    setSending(true)
    setToast(null)
    try {
      setToast(sendOutcome(await sendEnquiriesToFms(ids), neverSendStatusLabels(dropdowns)))
      changed()
      setNonce((x) => x + 1) // refetch: sent rows gain their badge and lose their checkbox; selection clears
    } catch (e) {
      // Nothing was sent (the RPC is atomic) — leave the rows ticked so the user can simply retry.
      setToast({ tone: 'error', text: e.message })
    } finally {
      busyRef.current = false
      setSending(false)
    }
  }

  async function handleDelete() {
    const chosen = rows.filter((r) => selected.has(r.id))
    const ids = chosen.map((r) => r.id)
    if (!ids.length || busyRef.current) return
    if (!confirm(deleteConfirmText(chosen, canDeleteSent))) return
    busyRef.current = true
    setDeleting(true)
    setToast(null)
    try {
      setToast(deleteOutcome(await deleteEnquiries(ids), canDeleteSent))
      changed()
      setNonce((x) => x + 1) // refetch: the rows are gone; selection clears; a page that emptied steps back
    } catch (e) {
      // Nothing was deleted (the RPC is atomic) — leave the rows ticked so the user can simply retry.
      setToast({ tone: 'error', text: e.message })
    } finally {
      busyRef.current = false
      setDeleting(false)
    }
  }

  // ---- cell / draft callbacks ----
  // Any inline-cell failure also lands here (the cell itself only has room for a tint + tooltip). A lock failure
  // (someone else saved / the row was sent meanwhile) offers a Reload.
  function handleCellError(e) {
    const lock = ['conflict', 'locked', 'gone'].includes(e.code)
    setToast({ tone: 'error', text: e.message, action: lock ? { label: 'Reload', onClick: reload } : undefined })
  }
  const patchRow = (saved) => setResult((r) => ({ ...r, rows: r.rows.map((x) => (x.id === saved.id ? saved : x)) }))
  function addDraft() {
    draftSeq.current += 1
    const id = draftSeq.current
    setDrafts((d) => [...d, id])
  }
  const removeDraft = (id) => setDrafts((d) => d.filter((x) => x !== id))
  // A row created by hand with an AUTO status was sent by the database as it was saved: re-read it to say so (it is locked now).
  async function handleDraftSaved(id, saved) {
    removeDraft(id)
    const who = saved?.name || 'the contact'
    changed()
    showFirstPage() // new entries sort to the top of page 1
    let text = `Enquiry saved for ${who}.`
    try {
      const fresh = saved?.id ? await fetchEnquiry(saved.id) : null
      if (fresh?.sent_to_fms_at) text = `Enquiry saved for ${who} and sent to Sales FMS (status ${statusLabel(fresh.status)}) — it is now locked.`
    } catch {
      /* the plain message stands; the list below shows whether it went */
    }
    setToast({ tone: 'success', text })
  }
  function handleImported() {
    changed()
    showFirstPage()
  }
  async function handleTemplate() {
    try {
      await downloadEnquiryTemplate()
    } catch (e) {
      setToast({ tone: 'error', text: `Couldn't create the template: ${e.message}` })
    }
  }

  // ---- managed lists ----
  function openManage(key, anchorEl) {
    setManageEl(anchorEl)
    setManageKey(key)
  }
  const manage = manageKey ? MANAGED[manageKey] : null
  // Status shows its display labels and marks the six built-ins (no Remove for those — the database refuses it as well).
  const manageItems = !manage
    ? []
    : manageKey === 'status'
      ? (dropdowns?.status || []).map((o) => ({ ...o, label: statusLabel(o.value), locked: isBuiltinStatus(o.value), rule: o.fms_rule }))
      : dropdowns?.[manage.type] || []
  const manageAdd = async (value) => {
    await addDropdownOption(manage.type, value)
    await onDropdownsChanged()
  }
  const manageSetActive = async (item, active) => {
    await setDropdownOptionActive(item.id, active)
    await onDropdownsChanged()
  }
  const manageSetRule = async (item, rule) => {
    await setStatusFmsRule(item.id, rule)
    await onDropdownsChanged()
  }
  // The status Manage list also sets what each status means for Sales FMS.
  const statusManage = manageKey === 'status' && (dropdowns?.status || []).some((o) => o.fms_rule)

  // A status change the database turned into a send (an AUTO status): re-read the row — it is now sent and locked — and say so.
  async function handleAutoSent(row) {
    changed() // the database sent it: Sales FMS has a new lead
    setSelected((prev) => {
      if (!prev.has(row.id)) return prev
      const next = new Set(prev)
      next.delete(row.id)
      return next
    })
    try {
      const fresh = await fetchEnquiry(row.id)
      if (fresh) patchRow(fresh)
      if (fresh?.sent_to_fms_at) setToast({ tone: 'success', text: `${row.name} was sent to Sales FMS (status ${statusLabel(fresh.status)}) and is now locked.` })
      else setToast({ tone: 'warn', text: `Status saved, but ${row.name} was not sent to Sales FMS — send it with the button if it should go.` })
    } catch (e) {
      setToast({ tone: 'warn', text: `Status saved; the row could not be re-read (${e.message}). Reload to see whether it was sent.`, action: { label: 'Reload', onClick: reload } })
    }
  }

  // ---- header menus: every column sorts; the admin's also filter ----
  const f = query.filters
  const sortFor = (key) => ({ kind: ENQUIRY_SORT_KINDS[key], current: query.sort?.key === key ? query.sort.dir : null, onSort: (dir) => changeSort(key, dir) })
  const sortOnly = (key, label) => <ColumnFilter label={label} kind="none" sort={sortFor(key)} />
  const filtered = (key, label, kind, extra = {}) => (admin ? <ColumnFilter label={label} kind={kind} value={f[key]} onChange={(v) => changeFilter(key, v)} sort={sortFor(key)} {...extra} /> : sortOnly(key, label))
  const valuesFilter = (key, label) => filtered(key, label, 'checklist', { loadValues: () => fetchEnquiryColumnValues(key, query.filters) })
  // A header for a column backed by a managed list. An admin gets the filter menu with a Manage link in it (when allowed);
  // a manager without filters gets a settings button beside the sort menu, so the permission is still reachable.
  const managedHeader = (key, filterKey, headerLabel, filterProps = {}) => {
    const manageCfg = canManage && dropdowns ? { label: MANAGED[key].manageLabel, onClick: (el) => openManage(key, el) } : undefined
    if (admin) return filtered(filterKey, headerLabel, 'checklist', { ...filterProps, manage: manageCfg })
    return (
      <>
        {sortOnly(filterKey, headerLabel)}
        {manageCfg && <ManageButton label={MANAGED[key].label} onOpen={(el) => openManage(key, el)} />}
      </>
    )
  }
  const sourceHeader = () => managedHeader('source', 'source', 'Source', { options: listFilterOptions(dropdowns?.source), includeBlanks: true })
  const salesPersonHeader = () => managedHeader('sales_person', 'salesPerson', 'Sales Person', { options: listFilterOptions(dropdowns?.sales_person), includeBlanks: true })
  const statusHeader = () => managedHeader('status', 'status', 'Status', { options: statusFilterOptions(dropdowns), nonNullable: true })
  const requirementHeader = () => managedHeader('requirement', 'requirement', 'Requirement', { loadValues: () => fetchEnquiryColumnValues('requirement', query.filters) })

  // The lists failing to load is a persistent condition, shown as a warning toast (it never moves the table) until
  // dismissed — and it also covers an Excel import, which then takes Source / Sales Person exactly as typed.
  const listsToast =
    dropdownsError && !dropdowns && listsSeen !== dropdownsError
      ? { tone: 'warn', text: `Couldn't load the dropdown lists (${dropdownsError}) — Source, Sales Person and Requirement cells stay read-only, and an Excel import takes those columns exactly as typed.`, action: { label: 'Retry', onClick: () => onDropdownsChanged() } }
      : null

  const onManage = canManage && dropdowns ? openManage : undefined
  const rowProps = { canEdit, selectable: canSelect, selectableSent: canDeleteSent, showChannel: admin, dropdowns, onManage, onAutoSent: handleAutoSent }

  return (
    <div>
      {firstLoad && loading && <div className="text-center py-10 text-text-muted text-[13px]">Loading enquiries…</div>}

      {error && !loading && (
        <div className="text-center py-10 text-danger text-[13px]">
          Could not load enquiries: {error}
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
            count={total}
            actions={
              <div className="flex items-center gap-1.5 flex-wrap justify-end">
                {canCreate && (
                  <button type="button" onClick={addDraft} className={`${TOOL} ${PRIMARY} shrink-0`} title="Add a new row at the top of the sheet">
                    <Icon name="plus" size={13} />
                    New Row
                  </button>
                )}
                {canUpload && (
                  <>
                    <button type="button" onClick={() => setUploadOpen(true)} aria-label="Upload Excel" title="Upload an Excel file" className={`${TOOL} shrink-0`}>
                      <Icon name="upload" size={14} />
                    </button>
                    <button type="button" onClick={handleTemplate} aria-label="Download template" title="Download the Excel template" className={`${TOOL} shrink-0`}>
                      <Icon name="download" size={14} />
                    </button>
                  </>
                )}
                <ToolbarSlot show={filtersActive} width="w-[104px]">
                  <button type="button" onClick={clearFilters} className={`${TOOL} w-full`}>
                    Clear filters
                  </button>
                </ToolbarSlot>
                {canSelect && (
                  <ToolbarSlot show={selected.size > 0} width="w-[118px]">
                    <button type="button" onClick={() => setSelected(new Set())} className={`${TOOL} w-full`}>
                      Clear selection
                    </button>
                  </ToolbarSlot>
                )}
                {canDelete && (
                  <ToolbarSlot show={selected.size > 0} width="w-[132px]">
                    <button type="button" disabled={sending || deleting || loading} onClick={handleDelete} className={`${TOOL} ${DANGER} w-full`}>
                      <Icon name={deleting ? 'loader' : 'trash'} size={13} />
                      {deleting ? 'Deleting…' : `Delete ${selected.size}`}
                    </button>
                  </ToolbarSlot>
                )}
                {canSend && (
                  <ToolbarSlot show={sendIds.length > 0} width="w-[168px]">
                    <button type="button" disabled={sending || deleting || loading} onClick={handleSend} className={`${TOOL} ${PRIMARY} w-full`}>
                      <Icon name={sending ? 'loader' : 'send'} size={13} />
                      {sending ? 'Sending…' : `Send ${sendIds.length} to FMS`}
                    </button>
                  </ToolbarSlot>
                )}
                <span className="inline-flex justify-end min-w-[150px]">
                  <TopPagination page={query.page} pageSize={ENQUIRY_PAGE_SIZE} total={total} onPageChange={changePage} />
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
              <Th className={COL.details}>#</Th>
              <Th className={COL.date} filter={filtered('date', 'Date', 'dateRange')}>
                Date
              </Th>
              <Th className={COL.name} filter={valuesFilter('name', 'Name')}>
                Name
              </Th>
              <Th className={COL.company} filter={valuesFilter('company', 'Company')}>
                Company
              </Th>
              <Th className={COL.phone} filter={valuesFilter('phone', 'Phone')}>
                Phone
              </Th>
              <Th className={COL.email} filter={sortOnly('email', 'Email')}>
                Email
              </Th>
              <Th className={COL.requirement} filter={requirementHeader()}>
                Requirement
              </Th>
              <Th className={COL.source} filter={sourceHeader()}>
                Source
              </Th>
              <Th className={COL.salesPerson} filter={salesPersonHeader()}>
                Sales Person
              </Th>
              <Th className={COL.clientType} filter={filtered('clientType', 'Client Type', 'checklist', { options: CLIENT_TYPE_OPTIONS, includeBlanks: true })}>
                Client Type
              </Th>
              <Th className={COL.status} filter={statusHeader()}>
                Status
              </Th>
              {admin && (
                <Th className={COL.channel} filter={filtered('channel', 'Channel', 'checklist', { options: CHANNEL_FILTER_OPTIONS, nonNullable: true })}>
                  Channel
                </Th>
              )}
              <Th className={COL.fms} filter={filtered('fms', 'FMS', 'checklist', { options: FMS_FILTER_OPTIONS, nonNullable: true })}>
                FMS
              </Th>
            </TableHead>
            <tbody>
              {drafts.map((id) => (
                <EnquiryDraftRow
                  key={id}
                  label={`New row ${id}`}
                  selectable={canSelect}
                  showChannel={admin}
                  dropdowns={dropdowns}
                  onManage={onManage}
                  onSaved={(saved) => handleDraftSaved(id, saved)}
                  onDiscard={() => removeDraft(id)}
                  onError={(text) => setToast({ tone: 'error', text })}
                />
              ))}
              {!rows.length && !drafts.length ? (
                <tr>
                  <Td colSpan={colCount} align="center" className="py-10 text-text-muted">
                    {admin ? (
                      <>
                        No enquiries found.
                        {filtersActive && (
                          <button type="button" onClick={clearFilters} className="ml-2 text-primary font-semibold bg-transparent border-none underline">
                            Clear filters
                          </button>
                        )}
                      </>
                    ) : canCreate ? (
                      "You haven't added any enquiries yet — click New Row."
                    ) : (
                      'No enquiries to show.'
                    )}
                  </Td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <EnquiryRow key={r.id} row={r} rowNumber={(query.page - 1) * ENQUIRY_PAGE_SIZE + i + 1} {...rowProps} selected={selected.has(r.id)} onToggle={(c) => toggleOne(r.id, c)} onDetails={setDetailId} onRowSaved={(saved) => { patchRow(saved); changed() }} onError={handleCellError} />
                ))
              )}
            </tbody>
          </Table>
        </div>
      )}

      <EnquiryDetailModal enquiry={detail} admin={admin} onClose={() => setDetailId(null)} />

      <ManageListPopover
        anchorRef={manageAnchor}
        open={!!manage}
        onClose={() => setManageKey(null)}
        label={manage?.label ?? ''}
        items={manageItems}
        onAdd={manageAdd}
        onSetActive={manageSetActive}
        {...(statusManage ? { rules: FMS_RULE_OPTIONS, onSetRule: manageSetRule, ruleCaption: 'Sends to FMS: Auto-send = a lead whose status is changed to it, or that is created by hand with it, goes to Sales FMS at once (an Excel import never does) · Manual = only with the Send button · Never send = blocked.', width: 400 } : {})}
      />

      {/* Closing the modal discards a file that was picked but not imported (an import in flight still finishes). */}
      <OverlayShell open={uploadOpen} onClose={() => setUploadOpen(false)} maxWidth="max-w-5xl" closeIcon={<Icon name="x" size={16} />}>
        <div className="text-[16px] font-semibold text-text mb-4 pr-10">Bulk Upload</div>
        <EnquiryUploadTab dropdowns={dropdowns} listsError={dropdownsError} active onDropdownsChanged={onDropdownsChanged} onImported={handleImported} notify={setToast} />
      </OverlayShell>

      <Toast toast={toast ?? listsToast} onDismiss={() => (toast ? setToast(null) : setListsSeen(dropdownsError))} />
    </div>
  )
}
