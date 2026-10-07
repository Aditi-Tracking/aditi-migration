import { useEffect, useState } from 'react'
import OverlayShell from '../../shared/OverlayShell'
import TableHead from '../../shared/table/TableHead'
import Th from '../../shared/table/Th'
import Td from '../../shared/table/Td'
import Tr from '../../shared/table/Tr'
import { fetchMappingArchive, mappingErrorMessage } from '../../../lib/customerMapping'

function fmtDate(s) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Read-only list of customer_gps_aliases_archive — GPS names that vanished from the live server
// data for 7 consecutive daily checks. New UI, not a port. No restore button on purpose: a name
// that reappears on the server moves back into the main list by itself on the next daily run.
// A plain <table> (not the shared Table) — Table's page-scroll sticky header clone has no
// meaning inside a modal that scrolls on its own.
export default function MappingArchiveModal({ open, onClose }) {
  const [q, setQ] = useState('')
  const [data, setData] = useState({ total: 0, rows: [] })
  const [state, setState] = useState('loading') // loading | done | error
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return undefined
    const ctrl = new AbortController()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refetches whenever the modal opens or the search changes
    setState('loading')
    const t = setTimeout(
      () => {
        fetchMappingArchive({ q: q.trim(), signal: ctrl.signal })
          .then((d) => {
            setData(d || { total: 0, rows: [] })
            setState('done')
          })
          .catch((e) => {
            if (e?.name === 'AbortError') return
            setError(mappingErrorMessage(e, 'Could not load the archive'))
            setState('error')
          })
      },
      q ? 250 : 0
    )
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [open, q])

  return (
    <OverlayShell open={open} onClose={onClose} maxWidth="max-w-4xl">
      <div className="pr-8 mb-3">
        <div className="text-[16px] font-bold text-text">📦 Archived GPS companies</div>
        <div className="text-[12px] text-text-muted mt-0.5">
          Names missing from the live server data for 7 days in a row. Their mappings are kept — a name that reappears restores itself.
        </div>
      </div>

      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="🔍 Search archived name..."
        className="text-[12.5px] rounded-md border border-border bg-surface px-3 py-1.5 w-full max-w-[320px] mb-3"
      />

      {state === 'error' ? (
        <div className="py-8 text-center text-[13px] text-danger">⚠ {error}</div>
      ) : (
        <div className={`rounded-xl border border-border overflow-x-auto ${state === 'loading' ? 'opacity-60' : ''}`}>
          <table className="w-full text-[12.5px] border-collapse">
            <TableHead>
              <Th>GPS Company Name</Th>
              <Th>Region</Th>
              <Th>Mapped To</Th>
              <Th>Archived</Th>
              <Th>Last Seen</Th>
            </TableHead>
            <tbody>
              {!data.rows.length ? (
                <tr>
                  <Td colSpan={5} align="center" className="py-10 text-text-muted">
                    {state === 'loading' ? '⏳ Loading...' : 'No archived names.'}
                  </Td>
                </tr>
              ) : (
                data.rows.map((r) => (
                  <Tr key={r.id}>
                    <Td className="font-semibold max-w-[260px] truncate" title={r.gps_name}>
                      {r.gps_name}
                    </Td>
                    <Td className="text-text-muted">{r.region || '—'}</Td>
                    <Td className={`max-w-[240px] truncate ${r.canonical_name ? 'text-text' : 'text-text-muted italic'}`} title={r.canonical_name || 'Not mapped'}>
                      {r.canonical_name || 'Not mapped'}
                    </Td>
                    <Td className="text-text-muted whitespace-nowrap">{fmtDate(r.archived_at)}</Td>
                    <Td className="text-text-muted whitespace-nowrap">{fmtDate(r.last_seen_at)}</Td>
                  </Tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
      {state === 'done' && data.total > data.rows.length && (
        <div className="mt-2 text-[11.5px] text-text-muted">
          Showing the first {data.rows.length} of {data.total} — refine the search to see others.
        </div>
      )}
    </OverlayShell>
  )
}
