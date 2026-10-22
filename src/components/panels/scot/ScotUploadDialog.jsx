import { useRef, useState } from 'react'
import Icon from '../../shared/Icon'
import OverlayShell from '../../shared/OverlayShell'
import { fetchDropdownOptions } from '../../../lib/enquiries'
import {
  MAX_SCOT_IMPORT_ROWS, MAX_SCOT_UPLOAD_BYTES, analyseScotGrid, downloadScotSkipped, downloadScotTemplate, findScotDuplicates, importScotClients, isValidScotFile, readScotGrid, scotPhoneKey,
} from '../../../lib/scot'

const BTN = 'inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg border border-border bg-transparent text-text-muted text-[12px] font-semibold hover:bg-surface-2 hover:text-text disabled:opacity-50'
const PRIMARY = '!bg-primary !text-white !border-primary'
const TH = 'px-3 py-1.5 font-semibold text-text-muted uppercase text-[10px] tracking-wide whitespace-nowrap text-left'
const SHOWN = 50

// Bulk upload of contacts from an Excel file (the real "Cold Leads" layout) (the same flow as the Enquiry Capture Sheet's upload): choose a file → a PREVIEW sorts every row into
//   Valid       will be imported
//   Rejected    something is wrong with it (no phone, a phone with under 7 digits, no contact name and no opportunity, text too long …) — the reason is shown
//   Duplicate   its phone is already tracked, or appeared earlier in the file — NOT imported (one live client per phone number)
// and nothing is written until "Import". The rows that will not be imported can be downloaded with their reason, fixed and uploaded again.
// The Sales Person column is matched to the managed list (case-insensitive) when the user may read that list. The database decides again on import
// (a number tracked in the meantime is reported as a duplicate, not an error).
// Props: onClose, onImported(result) — the file was imported — and notify(toast).
export default function ScotUploadDialog({ onClose, onImported, notify }) {
  const [phase, setPhase] = useState('pick') // pick | reading | preview | importing
  const [file, setFile] = useState(null)
  const [error, setError] = useState('')
  const [view, setView] = useState(null) // { headers, missing, ignored, valid, rejected, duplicate }
  const inputRef = useRef(null)
  const busy = phase === 'reading' || phase === 'importing'

  async function choose(f) {
    setError('')
    setView(null)
    if (!f) return
    if (!isValidScotFile(f)) return setError('Choose an Excel file (.xlsx or .xls).')
    if (f.size > MAX_SCOT_UPLOAD_BYTES) return setError('That file is too large (5 MB at most).')
    setFile(f)
    setPhase('reading')
    try {
      const grid = await readScotGrid(f)
      let people = null
      try {
        people = (await fetchDropdownOptions()).sales_person?.filter((o) => o.is_active).map((o) => o.value) || null
      } catch {
        /* the list is for the admin's convenience only — the file is used as typed */
      }
      const a = analyseScotGrid(grid, people)
      if (a.missing.length) {
        setPhase('pick')
        return setError(`The file has no ${a.missing.join(' and ')} column. Download the template to see the headings.`)
      }
      if (!a.rows.length) {
        setPhase('pick')
        return setError('The file has no rows to import.')
      }
      if (a.rows.length > MAX_SCOT_IMPORT_ROWS) {
        setPhase('pick')
        return setError(`Too many rows (${a.rows.length}). Up to ${MAX_SCOT_IMPORT_ROWS} per file.`)
      }
      const rejected = a.rows.filter((r) => r.errors.length).map((r) => ({ ...r, reason: r.errors.join(' · ') }))
      const candidates = a.rows.filter((r) => !r.errors.length)
      const seen = new Map()
      const inFile = []
      const fresh = []
      for (const r of candidates) {
        const k = scotPhoneKey(r.fields.phone)
        if (seen.has(k)) inFile.push({ ...r, reason: `Same phone as row ${seen.get(k)} of this file` })
        else {
          seen.set(k, r.line)
          fresh.push(r)
        }
      }
      const existing = fresh.length ? await findScotDuplicates(fresh.map((r) => r.fields.phone)) : []
      const byKey = new Map(existing.map((d) => [scotPhoneKey(d.phone), d]))
      const duplicate = [...inFile]
      const valid = []
      for (const r of fresh) {
        const d = byKey.get(scotPhoneKey(r.fields.phone))
        if (d) duplicate.push({ ...r, reason: d.contact_name ? `Already tracked (${d.contact_name})` : 'Already tracked by someone else' })
        else valid.push(r)
      }
      duplicate.sort((x, y) => x.line - y.line)
      setView({ headers: a.headers, ignored: a.ignored, dayColumns: a.dayColumns, valid, rejected, duplicate })
      setPhase('preview')
    } catch (e) {
      setPhase('pick')
      setError(e.message)
    }
  }

  async function run() {
    if (!view?.valid.length || busy) return
    setPhase('importing')
    try {
      const res = await importScotClients(file.name, view.valid.map((r) => r.fields))
      const extra = res.duplicates.length + res.rejected.length
      notify({ tone: extra ? 'warn' : 'success', text: `Imported ${res.imported} contact${res.imported === 1 ? '' : 's'}${extra ? ` · ${res.duplicates.length} duplicate and ${res.rejected.length} rejected by the database were skipped` : ''}.` })
      onImported(res)
    } catch (e) {
      notify({ tone: 'error', text: e.message })
      setPhase('preview')
    }
  }

  const skipped = view ? [...view.rejected, ...view.duplicate].sort((a, b) => a.line - b.line) : []
  const tile = (label, n, tone) => (
    <div className={`w-[130px] h-[52px] rounded-lg border border-border px-3 py-1 flex flex-col justify-between`} data-tile={label.toLowerCase()}>
      <span className="text-[10.5px] font-semibold uppercase tracking-wide text-text-muted">{label}</span>
      <span className={`text-[18px] leading-none font-extrabold tabular-nums ${tone}`}>{n}</span>
    </div>
  )
  const list = (title, rows) =>
    rows.length > 0 && (
      <div className="mb-3" data-role={`list-${title.toLowerCase()}`}>
        <div className="text-[12px] font-semibold text-text mb-1">
          {title} ({rows.length})
        </div>
        <div className="max-h-[150px] overflow-y-auto rounded-lg border border-border">
          <table className="w-full text-[12px] border-collapse">
            <thead className="sticky top-0 bg-surface">
              <tr className="border-b border-border">
                <th className={TH}>Row</th>
                <th className={TH}>Contact</th>
                <th className={TH}>Phone</th>
                <th className={TH}>Why</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, SHOWN).map((r) => (
                <tr key={r.line} className="h-7 border-b border-border last:border-b-0">
                  <td className="px-3 tabular-nums">{r.line}</td>
                  <td className="px-3 max-w-[160px] truncate">{r.fields.contact_name || '—'}</td>
                  <td className="px-3 whitespace-nowrap">{r.fields.phone || '—'}</td>
                  <td className="px-3 text-text-muted">{r.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length > SHOWN && <div className="mt-0.5 text-[11px] text-text-muted">Showing the first {SHOWN}; download the file for all of them.</div>}
      </div>
    )

  return (
    <OverlayShell open onClose={busy ? () => {} : onClose} maxWidth="max-w-3xl" closeIcon={<Icon name="x" size={16} />}>
      <div className="text-[16px] font-semibold text-text pr-10">Upload contacts from Excel</div>
      <div className="text-[12.5px] text-text-muted mb-3">
        One row per contact, in the Cold Leads layout. A row with no phone number is not imported; neither is a phone that is already tracked (or repeated in the file). A row with no Contact Name uses its Opportunity. Nothing is saved until you press Import.
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input ref={inputRef} type="file" accept=".xlsx,.xls" hidden aria-label="Excel file" onChange={(e) => { choose(e.target.files?.[0]); e.target.value = '' }} />
        <button type="button" data-role="choose" disabled={busy} onClick={() => inputRef.current?.click()} className={`${BTN} ${view ? '' : PRIMARY}`}>
          <Icon name={phase === 'reading' ? 'loader' : 'upload'} size={13} />
          {phase === 'reading' ? 'Reading…' : view ? 'Choose another file' : 'Choose a file'}
        </button>
        <button type="button" data-role="template" disabled={busy} onClick={() => downloadScotTemplate().catch((e) => notify({ tone: 'error', text: `Couldn't create the template: ${e.message}` }))} className={BTN}>
          <Icon name="download" size={13} />
          Download template
        </button>
        {file && <span className="text-[12px] text-text-muted truncate max-w-[260px]" title={file.name}>{file.name}</span>}
      </div>

      <div role="alert" data-role="error" className="min-h-[18px] text-[12px] leading-[18px] text-danger mb-2">
        {error}
      </div>

      {view && (
        <>
          <div className="flex flex-wrap gap-2 mb-3" data-role="tiles">
            {tile('Valid', view.valid.length, 'text-[#16A34A]')}
            {tile('Rejected', view.rejected.length, view.rejected.length ? 'text-danger' : 'text-text')}
            {tile('Duplicate', view.duplicate.length, view.duplicate.length ? 'text-[#B77900]' : 'text-text')}
          </div>
          {(view.ignored.length > 0 || view.dayColumns > 0) && (
            <div className="text-[11.5px] text-text-muted mb-2" data-role="unused">
              {view.ignored.length > 0 && <>Columns not used: {view.ignored.join(', ')}. </>}
              {view.dayColumns > 0 && <>{view.dayColumns} day column{view.dayColumns === 1 ? '' : 's'} (the call history) {view.dayColumns === 1 ? 'is' : 'are'} not imported.</>}
            </div>
          )}
          {list('Rejected', view.rejected)}
          {list('Duplicate', view.duplicate)}
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <button type="button" data-role="import" disabled={busy || !view.valid.length} onClick={run} className={`${BTN} ${PRIMARY}`}>
              <Icon name={phase === 'importing' ? 'loader' : 'check'} size={13} />
              {phase === 'importing' ? 'Importing…' : `Import ${view.valid.length} contact${view.valid.length === 1 ? '' : 's'}`}
            </button>
            {skipped.length > 0 && (
              <button type="button" data-role="download-skipped" disabled={busy} onClick={() => downloadScotSkipped({ headers: view.headers, skipped, fileName: file.name }).catch((e) => notify({ tone: 'error', text: e.message }))} className={BTN}>
                <Icon name="download" size={13} />
                Download the {skipped.length} not imported
              </button>
            )}
            <button type="button" disabled={busy} onClick={onClose} className={BTN}>
              Cancel
            </button>
          </div>
        </>
      )}
    </OverlayShell>
  )
}
