import { useEffect, useState } from 'react'
import { useAuth } from '../../../context/AuthContext'
import {
  JOB_TYPE_CONFIG,
  canDeleteEntry,
  canViewAllFieldService,
  deleteEntries,
  engineerName,
  fetchClientOptions,
  fetchEngineerOptions,
  fetchEntries,
  getCurrentAuthUserId,
} from '../../../lib/fieldService'
import EntryDetailModal from './EntryDetailModal'

const JOB_TYPES = Object.entries(JOB_TYPE_CONFIG)

const initialFilters = { jobType: '', engineerId: '', clientName: '', from: '', to: '' }

// Ported from old-portal/js/fieldservice.js's _fsRenderListSkeleton/_fsLoadEntries/
// _fsRenderEntriesList/_fsToggleSelectOne/_fsToggleSelectAll/_fsConfirmDeleteOne/
// _fsConfirmDeleteSelected/_fsRunDeleteFlow. Filters/engineer column only render for
// field_service_view_all — an own-scope viewer's list is never client-filtered, RLS alone
// already returns exactly their own rows.
export default function EntriesListTab({ active }) {
  const { currentUser, permissions } = useAuth()
  const viewAll = canViewAllFieldService(currentUser, permissions)

  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)
  const [authUserId, setAuthUserId] = useState(null)
  const [engineerOptions, setEngineerOptions] = useState([])
  const [clientOptions, setClientOptions] = useState([])
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filters, setFilters] = useState(initialFilters)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [listMsg, setListMsg] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [detailEntryId, setDetailEntryId] = useState(null)

  async function load(currentFilters) {
    setLoading(true)
    setError('')
    setSelectedIds(new Set()) // a reload always invalidates the current selection
    try {
      setEntries(await fetchEntries({ viewAll, ...currentFilters }))
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // Lazy — only the first time this tab is actually activated, matching production's own
  // "skeleton renders at panel init, entries fetch only on first switch to this tab" split.
  useEffect(() => {
    if (!active || hasLoadedOnce) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot activation gate, not a render loop
    setHasLoadedOnce(true)
    ;(async () => {
      const uid = await getCurrentAuthUserId()
      setAuthUserId(uid)
      if (viewAll) {
        const [eng, cl] = await Promise.all([fetchEngineerOptions(currentUser?.email), fetchClientOptions()])
        setEngineerOptions(eng)
        setClientOptions(cl)
      }
      await load(initialFilters)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot on first activation
  }, [active, hasLoadedOnce])

  function handleFilterChange(patch) {
    const next = { ...filters, ...patch }
    setFilters(next)
    load(next)
  }

  function handleClearFilters() {
    setFilters(initialFilters)
    load(initialFilters)
  }

  const deletable = entries.filter((e) => canDeleteEntry(e, { viewAll, authUserId }))
  const deletableIds = new Set(deletable.map((e) => String(e.id)))

  function toggleSelectOne(id, checked) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(String(id))
      else next.delete(String(id))
      return next
    })
  }

  function toggleSelectAll(checked) {
    setSelectedIds(checked ? new Set(deletable.map((e) => String(e.id))) : new Set())
  }

  async function runDeleteFlow(ids) {
    const n = ids.length
    const confirmed = confirm(
      `Delete ${n} ${n === 1 ? 'entry' : 'entries'}?\n\n` +
        `This will permanently delete the selected field service ${n === 1 ? 'entry' : 'entries'}, including all uploaded photos. This cannot be undone.`
    )
    if (!confirmed) return

    setDeleting(true)
    setListMsg({ text: `⏳ Deleting ${n} ${n === 1 ? 'entry' : 'entries'}…`, tone: 'info' })
    const results = await deleteEntries(ids)
    const failed = results.filter((r) => !r.ok)
    const succeeded = results.filter((r) => r.ok)

    if (!failed.length) {
      setListMsg({ text: `✅ Deleted ${succeeded.length} ${succeeded.length === 1 ? 'entry' : 'entries'}.`, tone: 'success' })
    } else if (succeeded.length) {
      setListMsg({
        text: `⚠️ Deleted ${succeeded.length} of ${results.length} — ${failed.length} failed: ${failed.map((f) => f.error).join('; ')}. Still-listed entries below were not deleted.`,
        tone: 'warn',
      })
    } else {
      setListMsg({ text: `❌ Delete failed: ${failed.map((f) => f.error).join('; ')}`, tone: 'error' })
    }
    setDeleting(false)
    // Refreshes from the server (so failed entries correctly reappear) and clears the
    // selection — load() handles both.
    await load(filters)
  }

  const STATUS_CLASS = {
    info: 'bg-primary-tint text-primary',
    success: 'bg-primary-tint text-primary',
    warn: 'bg-[#f0a500]/15 text-[#f0a500]',
    error: 'bg-danger-tint text-danger',
  }

  const detailEntry = entries.find((e) => String(e.id) === String(detailEntryId)) || null

  return (
    <div>
      {viewAll && (
        <div className="flex gap-2.5 flex-wrap mb-4">
          <select
            value={filters.jobType}
            onChange={(e) => handleFilterChange({ jobType: e.target.value })}
            className="px-3 py-2 rounded-lg border-[1.5px] border-border bg-surface-2 text-text text-[12.5px]"
          >
            <option value="">All Job Types</option>
            {JOB_TYPES.map(([k, c]) => (
              <option key={k} value={k}>
                {c.label}
              </option>
            ))}
          </select>
          <select
            value={filters.engineerId}
            onChange={(e) => handleFilterChange({ engineerId: e.target.value })}
            className="px-3 py-2 rounded-lg border-[1.5px] border-border bg-surface-2 text-text text-[12.5px]"
          >
            <option value="">All Engineers</option>
            {engineerOptions.map((en) => (
              <option key={en.engineer_id} value={en.engineer_id}>
                {en.name}
              </option>
            ))}
          </select>
          <select
            value={filters.clientName}
            onChange={(e) => handleFilterChange({ clientName: e.target.value })}
            className="px-3 py-2 rounded-lg border-[1.5px] border-border bg-surface-2 text-text text-[12.5px]"
          >
            <option value="">All Clients</option>
            {clientOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={filters.from}
            onChange={(e) => handleFilterChange({ from: e.target.value })}
            className="px-3 py-2 rounded-lg border-[1.5px] border-border bg-surface-2 text-text text-[12.5px]"
          />
          <input
            type="date"
            value={filters.to}
            onChange={(e) => handleFilterChange({ to: e.target.value })}
            className="px-3 py-2 rounded-lg border-[1.5px] border-border bg-surface-2 text-text text-[12.5px]"
          />
          <button type="button" onClick={handleClearFilters} className="px-3.5 py-2 rounded-lg border-[1.5px] border-border text-text-muted text-[12.5px] font-semibold">
            Clear
          </button>
        </div>
      )}

      {listMsg && <div className={`px-3.5 py-2.5 rounded-lg text-[13px] font-semibold mb-3.5 ${STATUS_CLASS[listMsg.tone]}`}>{listMsg.text}</div>}

      {!!deletable.length && (
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3.5 px-3.5 py-2.5 bg-surface-2 border border-border rounded-lg">
          <label className="flex items-center gap-2 text-[12.5px] text-text cursor-pointer select-none">
            <input
              type="checkbox"
              checked={deletable.length > 0 && deletable.every((e) => selectedIds.has(String(e.id)))}
              onChange={(e) => toggleSelectAll(e.target.checked)}
              className="w-4 h-4 cursor-pointer"
            />
            Select All
          </label>
          {selectedIds.size > 0 && (
            <button
              type="button"
              disabled={deleting}
              onClick={() => runDeleteFlow(Array.from(selectedIds))}
              className="px-4 py-2 rounded-lg border-none bg-danger text-white font-bold text-[12.5px] disabled:opacity-60"
            >
              🗑️ Delete {selectedIds.size} {selectedIds.size === 1 ? 'entry' : 'entries'}
            </button>
          )}
        </div>
      )}

      {loading && <div className="text-center py-10 text-text-muted text-[13px]">⏳ Loading entries…</div>}
      {!loading && error && <div className="text-center py-10 text-danger text-[13px]">⚠️ Could not load entries: {error}</div>}
      {!loading && !error && !entries.length && <div className="text-center py-10 text-text-muted text-[13px]">No entries found.</div>}

      {!loading && !error && !!entries.length && (
        <div>
          {entries.map((e) => {
            const cfg = JOB_TYPE_CONFIG[e.job_type]
            const label = cfg ? cfg.label : e.job_type
            const dateStr = e.created_at ? new Date(e.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
            const photoCount = (e.field_service_photos || []).length
            const canDelete = deletableIds.has(String(e.id))
            const checked = selectedIds.has(String(e.id))
            return (
              <div
                key={e.id}
                onClick={() => setDetailEntryId(e.id)}
                className="flex items-center gap-3 flex-wrap justify-between bg-surface border border-border rounded-xl px-4 py-3.5 mb-2.5 cursor-pointer hover:border-primary/40"
              >
                {canDelete ? (
                  <input
                    type="checkbox"
                    onClick={(ev) => ev.stopPropagation()}
                    onChange={(ev) => toggleSelectOne(e.id, ev.target.checked)}
                    checked={checked}
                    className="w-[18px] h-[18px] shrink-0 cursor-pointer"
                  />
                ) : (
                  <span className="w-[18px] shrink-0" />
                )}
                <div className="flex-1 min-w-[180px]">
                  <div className="font-bold text-text text-[14px]">{e.client_name}</div>
                  <div className="text-[12px] text-text-muted mt-0.5">
                    📍 {e.location} · 🗓️ {dateStr}
                    {viewAll ? ` · 👷 ${engineerName(e.engineer_id)}` : ''}
                  </div>
                </div>
                <span className="text-[11.5px] font-bold px-2.5 py-1 rounded-full bg-primary-tint text-primary border border-primary/25 whitespace-nowrap">{label}</span>
                {photoCount > 0 && <span className="text-[12px] text-text-muted">📷 {photoCount}</span>}
                {canDelete && (
                  <button
                    type="button"
                    onClick={(ev) => {
                      ev.stopPropagation()
                      runDeleteFlow([String(e.id)])
                    }}
                    title="Delete entry"
                    className="text-text-muted text-[15px] bg-transparent border-none shrink-0"
                  >
                    🗑️
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      <EntryDetailModal entry={detailEntry} viewAll={viewAll} onClose={() => setDetailEntryId(null)} />
    </div>
  )
}
