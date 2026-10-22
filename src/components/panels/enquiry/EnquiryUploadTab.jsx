import { useEffect, useMemo, useRef, useState } from 'react'
import Icon from '../../shared/Icon'
import TabButton from '../../shared/TabButton'
import { useLeadCaptureAccess } from '../../../context/LeadCaptureAccessContext'
import {
  CLIENT_TYPE_OPTIONS,
  MAX_UPLOAD_BYTES,
  addDropdownOptions,
  analyseEnquiryGrid,
  downloadEnquiryTemplate,
  downloadRejectedRows,
  fetchRecentImports,
  findPriorImports,
  isValidExcelFile,
  readEnquiryGrid,
  requirementText,
  runEnquiryImport,
  statusLabel,
  statusTone,
} from '../../../lib/enquiries'
import { canManageEnquiryDropdowns } from '../../../lib/enquiryPermissions'
import Table from '../../shared/table/Table'
import TableHead from '../../shared/table/TableHead'
import Th from '../../shared/table/Th'
import Td from '../../shared/table/Td'
import Tr from '../../shared/table/Tr'
import StatusBadge from '../../shared/table/StatusBadge'
import TopPagination from '../../shared/table/TopPagination'

const PREVIEW_PAGE_SIZE = 50
const HIGH_REJECTION_RATE = 0.5 // more than this share of rows rejected -> suggest checking the headers
const TYPE_LABEL = { source: 'Source', sales_person: 'Sales Person', product_interested: 'Product' }
const CLIENT_TYPE_LABELS = Object.fromEntries(CLIENT_TYPE_OPTIONS.map((o) => [o.value, o.label]))
const IMPORT_TONE = { completed: 'success', processing: 'warning', failed: 'danger' }
const BANNER_CLASS = {
  info: 'bg-surface-2 text-text-muted border border-border',
  warn: 'bg-[#f0a500]/15 text-[#f0a500]',
  error: 'bg-danger-tint text-danger',
  success: 'bg-primary-tint text-primary',
}
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`
const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString('en-IN') : '—')
const valueKey = (type, value) => `${type}|${String(value).replace(/\s+/g, ' ').toLowerCase()}`

function Notice({ tone, children }) {
  return (
    <div role="status" className={`flex items-start gap-2 px-3.5 py-2.5 rounded-lg text-[12.5px] font-semibold mb-3 ${BANNER_CLASS[tone]}`}>
      {tone === 'warn' && <Icon name="alert" size={14} className="mt-px shrink-0" />}
      <span>{children}</span>
    </div>
  )
}

function Tile({ label, value, sub, tone = 'text-text' }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3 min-w-[120px] flex-1">
      <div className="text-[10.5px] font-semibold uppercase tracking-wide text-text-muted">{label}</div>
      <div className={`text-[22px] font-extrabold ${tone}`}>{value}</div>
      {sub && <div className="text-[11px] text-text-muted">{sub}</div>}
    </div>
  )
}

// One preview table for the active chip (Will import / Rejected / Duplicates). Same fixed-row-height
// rule as the list: every cell is nowrap or truncate with a title, paged client-side.
function PreviewTable({ tab, analysis, unknownKeys, page, onPage }) {
  const items = tab === 'valid' ? analysis.valid : tab === 'rejected' ? analysis.rejected : analysis.valid.filter((v) => v.import_flag)
  const slice = items.slice((page - 1) * PREVIEW_PAGE_SIZE, page * PREVIEW_PAGE_SIZE)
  const pager = <TopPagination page={page} pageSize={PREVIEW_PAGE_SIZE} total={items.length} onPageChange={onPage} />
  const isNew = (type, value) => !!value && unknownKeys.has(valueKey(type, value))

  if (!items.length) {
    return (
      <div className="rounded-xl border border-border bg-surface px-4 py-8 text-center text-[13px] text-text-muted">
        {tab === 'rejected' ? 'No rejected rows.' : tab === 'dups' ? 'No duplicate phone numbers in this file.' : 'Nothing to import.'}
      </div>
    )
  }

  return (
    <Table actions={pager}>
      <TableHead>
        <Th>Row</Th>
        <Th>Name</Th>
        {tab === 'valid' && <Th>Company</Th>}
        <Th>Phone</Th>
        {tab === 'valid' && (
          <>
            <Th>Requirement</Th>
            <Th>Source</Th>
            <Th>Sales Person</Th>
            <Th>Client Type</Th>
            <Th>Status</Th>
          </>
        )}
        {tab === 'rejected' && <Th>Why it was rejected</Th>}
        {tab === 'dups' && <Th>Same phone on rows</Th>}
      </TableHead>
      <tbody>
        {slice.map((it) => {
          const rec = it.record
          return (
            <Tr key={it.rowNumber}>
              <Td className="text-text-muted whitespace-nowrap" numeric>
                {it.rowNumber}
              </Td>
              <Td className="max-w-[150px] truncate font-semibold text-text" title={(rec ? rec.name : it.name) || ''}>
                {(rec ? rec.name : it.name) || '—'}
              </Td>
              {tab === 'valid' && (
                <Td className="max-w-[170px] truncate" title={rec.company_name || ''}>
                  {rec.company_name || '—'}
                </Td>
              )}
              <Td className="whitespace-nowrap">
                {(rec ? rec.phone : it.phone) || '—'}
                {tab === 'valid' && it.import_flag && (
                  <span className="ml-1.5 align-middle" title={`Same phone as row ${it.duplicateOf.join(', ')}`}>
                    <StatusBadge tone="warning">
                      <span className="inline-flex items-center gap-1">
                        <Icon name="alert" size={11} />
                        Duplicate
                      </span>
                    </StatusBadge>
                  </span>
                )}
              </Td>
              {tab === 'valid' && (
                <>
                  <Td className="max-w-[220px] truncate" title={requirementText(rec.requirement)}>
                    {requirementText(rec.requirement) || '—'}
                  </Td>
                  <Td className={`max-w-[120px] truncate ${isNew('source', rec.source) ? 'text-[#f0a500] font-semibold' : ''}`} title={rec.source ? `${rec.source}${isNew('source', rec.source) ? ' — not in the Source list' : ''}` : ''}>
                    {rec.source || '—'}
                  </Td>
                  <Td
                    className={`max-w-[130px] truncate ${isNew('sales_person', rec.sales_person_accountable) ? 'text-[#f0a500] font-semibold' : ''}`}
                    title={rec.sales_person_accountable ? `${rec.sales_person_accountable}${isNew('sales_person', rec.sales_person_accountable) ? ' — not in the Sales Person list' : ''}` : ''}
                  >
                    {rec.sales_person_accountable || '—'}
                  </Td>
                  <Td className="whitespace-nowrap">{CLIENT_TYPE_LABELS[rec.client_type] || '—'}</Td>
                  <Td>
                    <StatusBadge tone={statusTone(rec.status)}>{statusLabel(rec.status)}</StatusBadge>
                  </Td>
                </>
              )}
              {tab === 'rejected' && (
                <Td className="max-w-[420px] truncate text-danger" title={it.errors.join('; ')}>
                  {it.errors.join('; ')}
                </Td>
              )}
              {tab === 'dups' && (
                <Td className="max-w-[260px] truncate" title={it.duplicateOf.join(', ')}>
                  {it.duplicateOf.join(', ')}
                </Td>
              )}
            </Tr>
          )
        })}
      </tbody>
    </Table>
  )
}

function RecentImports({ recent, active }) {
  const loading = active && recent.key === null
  return (
    <div className="mt-8">
      <Table title="Recent imports" count={recent.rows.length || undefined} countLabel="batch">
        <TableHead>
          <Th>File</Th>
          <Th>Uploaded</Th>
          <Th align="right">Rows</Th>
          <Th align="right">Duplicates</Th>
          <Th align="right">Rejected</Th>
          <Th>Status</Th>
        </TableHead>
        <tbody>
          {loading ? (
            <tr>
              <Td colSpan={6} align="center" className="py-6 text-text-muted">
                Loading…
              </Td>
            </tr>
          ) : recent.error ? (
            <tr>
              <Td colSpan={6} align="center" className="py-6 text-danger">
                Could not load recent imports: {recent.error}
              </Td>
            </tr>
          ) : !recent.rows.length ? (
            <tr>
              <Td colSpan={6} align="center" className="py-6 text-text-muted">
                No imports yet.
              </Td>
            </tr>
          ) : (
            recent.rows.map((i) => (
              <Tr key={i.id}>
                <Td className="max-w-[260px] truncate font-semibold text-text" title={i.file_name}>
                  {i.file_name}
                </Td>
                <Td className="text-text-muted whitespace-nowrap">{fmtDateTime(i.uploaded_at)}</Td>
                <Td align="right" numeric>
                  {i.row_count}
                </Td>
                <Td align="right" numeric>
                  {i.duplicate_count}
                </Td>
                <Td align="right" numeric>
                  {i.rejected_count}
                </Td>
                <Td>
                  <StatusBadge tone={IMPORT_TONE[i.status] || 'neutral'}>{i.status}</StatusBadge>
                </Td>
              </Tr>
            ))
          )}
        </tbody>
      </Table>
    </div>
  )
}

// Bulk upload (admin only — the sheet only opens this, inside its Bulk Upload modal, for enquiry_view_all +
// enquiry_create, which is exactly what the enquiry_imports INSERT policy requires). Everything up to the final click
// happens in the browser: read the sheet, analyse it against the managed Source / Sales Person lists,
// show a preview, and only then — after a confirm — write.
//   idle -> parsing -> preview -> importing -> done        (a failed import returns to preview)
// The parsed `grid` is kept and re-analysed (useMemo) whenever the managed lists change, so adding
// a value mid-flow immediately clears it from the "new values" list and the preview stays truthful.
// Nothing is guessed or silently dropped: every non-blank row is either imported or listed as
// rejected with a reason (and downloadable); duplicate phones are flagged, not removed.
// The import itself is ONE atomic bulk insert (see runEnquiryImport) — hence no per-row progress.
export default function EnquiryUploadTab({ dropdowns, listsError, active, onDropdownsChanged, onImported, notify }) {
  const { permissions } = useLeadCaptureAccess()
  const canManage = canManageEnquiryDropdowns(permissions)

  const [phase, setPhase] = useState('idle')
  const [fileName, setFileName] = useState('')
  const [grid, setGrid] = useState(null)
  const [previewTab, setPreviewTab] = useState('valid')
  const [previewPage, setPreviewPage] = useState(1)
  const [addSel, setAddSel] = useState(() => new Set()) // "add to list" is opt-in — nothing ticked by default
  const [result, setResult] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [recentKey, setRecentKey] = useState(0)
  const [recent, setRecent] = useState({ key: null, rows: [], error: '' })
  const inputRef = useRef(null)
  const busyRef = useRef(false) // synchronous guard: parse / import can't be started twice

  const listsLoading = dropdowns === null && !listsError
  const busy = phase === 'parsing' || phase === 'importing'

  // Recent imports — loaded the first time the tab is shown, and again after each import.
  useEffect(() => {
    if (!active || recent.key === recentKey) return
    let cancelled = false
    fetchRecentImports()
      .then((rows) => !cancelled && setRecent({ key: recentKey, rows, error: '' }))
      .catch((e) => !cancelled && setRecent({ key: recentKey, rows: [], error: e.message }))
    return () => {
      cancelled = true
    }
  }, [active, recentKey, recent.key])

  const analysis = useMemo(() => {
    if (!grid) return null
    try {
      return analyseEnquiryGrid(grid, dropdowns)
    } catch {
      return null // already validated when the file was read; can't newly throw for the same grid
    }
  }, [grid, dropdowns])

  const addable = analysis ? analysis.unknownValues.filter((u) => !u.retired) : []
  const retiredHits = analysis ? analysis.unknownValues.filter((u) => u.retired) : []
  const unknownKeys = new Set(analysis ? analysis.unknownValues.map((u) => valueKey(u.type, u.value)) : [])
  const toAdd = canManage ? addable.filter((u) => addSel.has(valueKey(u.type, u.value))) : []
  const prior = analysis ? findPriorImports(recent.rows, fileName) : []
  const dupRows = analysis ? analysis.valid.filter((v) => v.import_flag) : []
  const rowsRead = analysis ? analysis.valid.length + analysis.rejected.length : 0
  const highRejection = !!analysis && rowsRead > 0 && analysis.rejected.length / rowsRead > HIGH_REJECTION_RATE

  async function handleFile(file) {
    if (!file || busyRef.current || listsLoading) return // the picker/drop zone are also disabled; this is the real guard
    notify(null)
    if (!isValidExcelFile(file)) {
      notify({ tone: 'error', text: 'Please choose an .xlsx or .xls file.' })
      return
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      notify({ tone: 'error', text: `That file is ${(file.size / 1048576).toFixed(1)} MB — the limit is ${MAX_UPLOAD_BYTES / 1048576} MB.` })
      return
    }
    busyRef.current = true
    const previousPhase = phase // a bad pick must not cost the user a good preview/result they already have
    setPhase('parsing')
    try {
      const g = await readEnquiryGrid(file)
      const a = analyseEnquiryGrid(g, dropdowns) // throws a readable message for missing columns / too many rows
      setGrid(g)
      setFileName(file.name)
      setAddSel(new Set())
      setResult(null)
      setPreviewTab(a.rejected.length ? 'rejected' : 'valid')
      setPreviewPage(1)
      setPhase('preview')
    } catch (e) {
      notify({ tone: 'error', text: e.message })
      setPhase(previousPhase)
    } finally {
      busyRef.current = false
    }
  }

  function reset() {
    setPhase('idle')
    setGrid(null)
    setFileName('')
    setResult(null)
  }

  function toggleAdd(u, checked) {
    setAddSel((prev) => {
      const next = new Set(prev)
      if (checked) next.add(valueKey(u.type, u.value))
      else next.delete(valueKey(u.type, u.value))
      return next
    })
  }

  async function handleImport() {
    if (busyRef.current || !analysis || !analysis.valid.length) return
    const lines = [`Import ${plural(analysis.valid.length, 'enquiry', 'enquiries')} from ${fileName}?`, '']
    if (analysis.rejected.length) lines.push(`${plural(analysis.rejected.length, 'row was', 'rows were')} rejected and will not be imported.`)
    if (dupRows.length) lines.push(`${plural(dupRows.length, 'row is', 'rows are')} flagged as duplicate phones (imported, flagged).`)
    if (toAdd.length) lines.push(`${plural(toAdd.length, 'new value', 'new values')} will be added to the dropdown lists.`)
    if (prior.length) lines.push(`A file with this name was already imported on ${fmtDateTime(prior[0].uploaded_at)} — importing it again will create duplicates.`)
    lines.push('', "This can't be undone from the portal.")
    if (!confirm(lines.join('\n'))) return

    busyRef.current = true
    setPhase('importing')
    notify(null)
    const rejectedCount = analysis.rejected.length
    const valid = analysis.valid
    try {
      if (toAdd.length) {
        try {
          await addDropdownOptions(toAdd.map((u) => ({ type: u.type, value: u.value })))
        } catch (e) {
          // Nothing has been imported yet — safe to stop, and to retry.
          notify({ tone: 'error', text: `Couldn't add the new values: ${e.message} Nothing was imported.` })
          setPhase('preview')
          return
        }
        await onDropdownsChanged()
      }
      const res = await runEnquiryImport({ fileName, valid, rejectedCount })
      setResult({ ...res, rejectedCount, fileName, added: toAdd.length })
      setGrid(null)
      setPhase('done')
      setRecentKey((k) => k + 1)
      onImported()
    } catch (e) {
      notify({ tone: 'error', text: e.message }) // runEnquiryImport's message already says no rows were imported
      setPhase('preview')
    } finally {
      busyRef.current = false
    }
  }

  async function handleDownloadRejected() {
    try {
      await downloadRejectedRows({ headers: analysis.headers, rejected: analysis.rejected, fileName })
    } catch (e) {
      notify({ tone: 'error', text: `Couldn't create the file: ${e.message}` })
    }
  }

  async function handleTemplate() {
    try {
      await downloadEnquiryTemplate()
    } catch (e) {
      notify({ tone: 'error', text: `Couldn't create the template: ${e.message}` })
    }
  }

  const pickerDisabled = busy || listsLoading
  const openPicker = () => !pickerDisabled && inputRef.current?.click()

  return (
    <div>
      {phase === 'done' && result && (
        <div className={`rounded-xl border p-4 mb-5 ${result.bookkeepingFailed ? 'border-[#f0a500]/40 bg-[#f0a500]/10' : 'border-primary/30 bg-primary-tint'}`}>
          <div className={`flex items-center gap-2 font-bold text-[14px] ${result.bookkeepingFailed ? 'text-[#f0a500]' : 'text-primary'}`}>
            <Icon name={result.bookkeepingFailed ? 'alert' : 'check'} size={16} className="shrink-0" />
            <span>
              Imported {plural(result.inserted, 'enquiry', 'enquiries')} from {result.fileName}
            </span>
          </div>
          <div className="text-[12.5px] text-text mt-1.5">
            {result.duplicateCount > 0 && <div>{plural(result.duplicateCount, 'row is', 'rows are')} flagged as duplicate phones — find them by the warning icon in the sheet's first column.</div>}
            {result.rejectedCount > 0 && <div>{plural(result.rejectedCount, 'rejected row was', 'rejected rows were')} skipped.</div>}
            {result.added > 0 && <div>{plural(result.added, 'new value was', 'new values were')} added to the lists.</div>}
            {result.bookkeepingFailed && (
              <div className="font-semibold mt-1">
                The enquiries ARE saved, but the batch&apos;s summary record couldn&apos;t be updated. Do not import this file again — check Recent imports below.
              </div>
            )}
          </div>
          <button type="button" onClick={reset} className="mt-3 px-4 py-2 rounded-lg border-none bg-primary text-white font-bold text-[12.5px]">
            Upload another file
          </button>
        </div>
      )}

      {phase !== 'done' && (
        <>
          <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
            <div className="text-[12.5px] text-text-muted max-w-[640px]">
              Columns: <b>Name*</b>, Company Name, <b>Phone*</b>, Email, Requirement (product names separated by commas or semicolons), Source, Sales Person, Client Type (New / Existing), Status (Interested / RNR / Future Lead / Lost, an added status, or blank). Source, Sales Person and products
              should match the existing lists.
            </div>
            <button type="button" onClick={handleTemplate} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border-[1.5px] border-border text-text text-[12.5px] font-semibold bg-transparent">
              <Icon name="download" size={14} />
              Download template
            </button>
          </div>

          <div
            role="button"
            tabIndex={0}
            aria-disabled={pickerDisabled}
            onClick={openPicker}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                openPicker()
              }
            }}
            onDragOver={(e) => {
              e.preventDefault()
              if (!pickerDisabled) setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              if (!pickerDisabled && e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0])
            }}
            className={`rounded-2xl border-2 border-dashed px-5 py-8 text-center mb-3 transition-colors ${pickerDisabled ? 'opacity-60 cursor-default' : 'cursor-pointer'} ${dragOver ? 'border-primary' : 'border-border'}`}
          >
            <div className="flex justify-center mb-1.5 text-text-muted">
              <Icon name={phase === 'parsing' ? 'loader' : 'upload'} size={30} />
            </div>
            <div className="font-bold text-[14px] text-text">
              {phase === 'parsing'
                ? 'Reading file…'
                : listsLoading
                  ? 'Loading the Source / Sales Person lists…'
                  : phase === 'preview'
                    ? `${fileName} — click to choose a different file`
                    : 'Click to choose or drag & drop your Excel file'}
            </div>
            <div className="text-[12px] text-text-muted mt-1">.xlsx or .xls · up to {MAX_UPLOAD_BYTES / 1048576} MB · up to 5,000 rows</div>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = '' // so choosing the same file again still fires onChange
                handleFile(f)
              }}
            />
          </div>
        </>
      )}

      {phase !== 'done' && analysis && (
        <div>
          {prior.length > 0 && (
            <Notice tone="warn">
              A file named “{fileName}” was already imported on {fmtDateTime(prior[0].uploaded_at)} ({prior[0].row_count} rows). Importing it again will create duplicates.
            </Notice>
          )}
          {highRejection && (
            <Notice tone="warn">
              More than half of the rows ({analysis.rejected.length} of {rowsRead}) were rejected — check that the column headers match the template.
            </Notice>
          )}
          {analysis.ignoredColumns.length > 0 && <Notice tone="info">Ignored columns (not in the template): {analysis.ignoredColumns.join(', ')}.</Notice>}

          <div className="flex gap-3 flex-wrap mb-4">
            <Tile label="Rows read" value={rowsRead} />
            <Tile label="Will import" value={analysis.valid.length} tone="text-primary" />
            <Tile label="Rejected" value={analysis.rejected.length} tone={analysis.rejected.length ? 'text-danger' : 'text-text'} />
            <Tile label="Flagged duplicates" value={analysis.duplicateRowCount} sub={analysis.duplicateGroupCount ? `${plural(analysis.duplicateGroupCount, 'group', 'groups')}` : undefined} tone={analysis.duplicateRowCount ? 'text-[#f0a500]' : 'text-text'} />
            <Tile label="New list values" value={analysis.unknownValues.length} tone={analysis.unknownValues.length ? 'text-[#f0a500]' : 'text-text'} />
          </div>

          {analysis.unknownValues.length > 0 && (
            <div className="rounded-xl border border-border bg-surface px-4 py-3 mb-4">
              <div className="text-[12.5px] font-semibold text-text mb-1.5">Values not in the Source / Sales Person / Product lists</div>
              {canManage ? (
                <div className="text-[12px] text-text-muted mb-2">
                  Tick a value to add it to the shared list when you import. Unticked values are imported as typed. (A typo added here becomes a permanent list entry — only tick what you mean to keep.)
                </div>
              ) : (
                <div className="text-[12px] text-text-muted mb-2">
                  These will be imported exactly as typed, and won&apos;t appear in the filter dropdowns until someone with list-management access adds them.
                </div>
              )}
              <div className="flex flex-col gap-1.5 max-h-[180px] overflow-y-auto">
                {addable.map((u) => (
                  <label key={valueKey(u.type, u.value)} className={`flex items-center gap-2 text-[12.5px] text-text ${canManage ? 'cursor-pointer' : ''}`}>
                    {canManage && <input type="checkbox" checked={addSel.has(valueKey(u.type, u.value))} disabled={busy} onChange={(e) => toggleAdd(u, e.target.checked)} />}
                    <span className="font-semibold">{u.value}</span>
                    <span className="text-text-muted">
                      — {TYPE_LABEL[u.type]}, {plural(u.rowCount, 'row', 'rows')}
                    </span>
                  </label>
                ))}
                {retiredHits.map((u) => (
                  <div key={valueKey(u.type, u.value)} className="text-[12.5px] text-text-muted">
                    <span className="font-semibold text-text">{u.value}</span> — {TYPE_LABEL[u.type]}, {plural(u.rowCount, 'row', 'rows')} · retired value (imported as typed; an admin can reactivate it)
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2 flex-wrap mb-3">
            {[
              ['valid', `Will import (${analysis.valid.length})`],
              ['rejected', `Rejected (${analysis.rejected.length})`],
              ['dups', `Duplicates (${dupRows.length})`],
            ].map(([id, label]) => (
              <TabButton
                key={id}
                variant="chip"
                active={previewTab === id}
                onClick={() => {
                  setPreviewTab(id)
                  setPreviewPage(1)
                }}
              >
                {label}
              </TabButton>
            ))}
          </div>

          <PreviewTable tab={previewTab} analysis={analysis} unknownKeys={unknownKeys} page={previewPage} onPage={setPreviewPage} />

          <div className="flex items-center justify-between gap-3 flex-wrap mt-4">
            <div>
              {analysis.rejected.length > 0 && (
                <button type="button" onClick={handleDownloadRejected} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border-[1.5px] border-border text-text text-[12.5px] font-semibold bg-transparent">
                  <Icon name="download" size={14} />
                  Download rejected rows
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" disabled={busy} onClick={reset} className="px-3.5 py-2 rounded-lg border-[1.5px] border-border text-text-muted text-[12.5px] font-semibold bg-transparent disabled:opacity-60">
                Cancel
              </button>
              <button
                type="button"
                disabled={busy || !analysis.valid.length}
                onClick={handleImport}
                className="inline-flex items-center justify-center gap-1.5 min-w-[210px] px-5 py-2 rounded-lg border-none bg-primary text-white font-bold text-[13px] disabled:opacity-60"
              >
                {phase === 'importing' && <Icon name="loader" size={14} />}
                {phase === 'importing' ? `Importing ${analysis.valid.length} rows…` : `Import ${plural(analysis.valid.length, 'enquiry', 'enquiries')}`}
              </button>
            </div>
          </div>
          {!analysis.valid.length && <div className="text-[12px] text-danger mt-2 text-right">There are no valid rows to import — fix the file (see Rejected) and upload it again.</div>}
        </div>
      )}

      <RecentImports recent={recent} active={active} />
    </div>
  )
}
