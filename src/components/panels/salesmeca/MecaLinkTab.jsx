import { useEffect, useState } from 'react'
import StatusBadge from '../../shared/table/StatusBadge'
import { fetchMecaDirectory, removeSalesRepAlias, setSalesRepAlias } from '../../../lib/salesMeca'

const BTN = 'inline-flex items-center justify-center h-8 px-3 rounded-lg border border-border bg-transparent text-text-muted text-[12px] font-semibold hover:bg-surface-2 hover:text-text disabled:opacity-50'
const GRID = 'grid grid-cols-[190px_56px_190px_minmax(0,1fr)] gap-x-3 items-center px-3'
const VIA = {
  alias: { tone: 'success', text: 'Linked' },
  name: { tone: 'neutral', text: 'Same name' },
  email: { tone: 'neutral', text: 'By e-mail' },
  none: { tone: 'warning', text: 'Not linked' },
}

// Setup › Link sales people. Every Sales Person label that appears in the data — the pick-list values (retired ones too) and any
// typed on a lead — with how many sent leads carry it and which employee it is attributed to. A label that matches exactly one
// employee's full name, or is an employee's e-mail, is attributed automatically ("Same name" / "By e-mail"); everything else
// ("Not linked") needs the admin to say who it is, and until then its numbers sit in an Unmapped row. The suggestions are only
// that: clicking one fills the picker, and nothing is saved until the admin presses Link.
// Props: notify(toast), onChanged() — the report behind this modal must refetch
export default function MecaLinkTab({ notify, onChanged }) {
  const [state, setState] = useState({ nonce: -1, data: null, error: '' })
  const [nonce, setNonce] = useState(0)
  const [view, setView] = useState(null) // 'unlinked' | 'all' | null (= unlinked while there are some)
  const [picked, setPicked] = useState({}) // label_key → employee e-mail chosen but not yet saved
  const [busy, setBusy] = useState('') // label_key being saved

  useEffect(() => {
    if (state.nonce === nonce) return undefined
    let cancelled = false
    fetchMecaDirectory()
      .then((data) => !cancelled && setState({ nonce, data, error: '' }))
      .catch((e) => !cancelled && setState((s) => ({ nonce, data: s.data, error: e.message })))
    return () => {
      cancelled = true
    }
  }, [nonce, state.nonce])

  const loading = state.nonce !== nonce
  const labels = state.data?.labels || []
  const employees = state.data?.employees || []
  const unlinked = labels.filter((l) => l.via === 'none')
  const effective = view || (unlinked.length ? 'unlinked' : 'all')
  const shown = effective === 'unlinked' ? unlinked : labels

  async function run(l, action, okText) {
    setBusy(l.label_key)
    try {
      await action()
      setPicked((p) => Object.fromEntries(Object.entries(p).filter(([k]) => k !== l.label_key)))
      notify({ tone: 'success', text: okText })
      onChanged()
      setNonce((n) => n + 1)
    } catch (e) {
      notify({ tone: 'error', text: e.message })
    } finally {
      setBusy('')
    }
  }
  const link = (l) => {
    const email = picked[l.label_key]
    const who = employees.find((x) => x.email === email)?.name || email
    return run(l, () => setSalesRepAlias(l.label, email), `"${l.label}" is now linked to ${who}.`)
  }
  const unlink = (l) => run(l, () => removeSalesRepAlias(l.label), `The link for "${l.label}" was removed.`)

  return (
    <div>
      <p className="text-[12.5px] text-text-muted mb-3">
        Tell MeCa which employee each Sales Person name on a lead stands for. A name nobody has linked is reported as its own “Unmapped” row, so no number is lost, but it is not credited to anyone.
      </p>
      <div className="flex items-center gap-2 mb-2 min-h-8">
        {[
          ['unlinked', `Not linked (${unlinked.length})`],
          ['all', `All names (${labels.length})`],
        ].map(([k, text]) => (
          <button key={k} type="button" aria-pressed={effective === k} onClick={() => setView(k)} className={`h-8 px-3 rounded-md border text-[12px] font-semibold ${effective === k ? 'bg-primary text-white border-primary' : 'bg-surface-2 text-text-muted border-border'}`}>
            {text}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-border">
        <div className={`${GRID} h-8 border-b border-border text-[10px] font-semibold uppercase tracking-wide text-text-muted`}>
          <span>Sales Person name</span>
          <span className="text-right">Leads</span>
          <span>Attributed to</span>
          <span>Link to an employee</span>
        </div>
        <div className="h-[352px] overflow-y-auto" data-role="link-list">
          {loading && !state.data && <div className="py-16 text-center text-text-muted text-[13px]">Loading…</div>}
          {state.error && !loading && !state.data && (
            <div className="py-12 text-center text-danger text-[13px]">
              Could not load the sales people: {state.error}
              <div className="mt-3">
                <button type="button" className={BTN} onClick={() => setNonce((n) => n + 1)}>
                  Retry
                </button>
              </div>
            </div>
          )}
          {state.data && !shown.length && <div className="py-16 text-center text-text-muted text-[13px]">{effective === 'unlinked' ? 'Every Sales Person name is linked.' : 'No Sales Person names yet.'}</div>}
          {shown.map((l) => {
            const via = VIA[l.via] || VIA.none
            const editable = l.via === 'none' || l.via === 'alias'
            const choice = picked[l.label_key] || ''
            const sugg = l.suggestions.slice(0, 2)
            return (
              <div key={l.label_key} className={`${GRID} h-[52px] border-b border-border last:border-b-0`} data-label={l.label_key}>
                <span className="truncate font-semibold text-[12.5px] text-text" title={l.label}>
                  {l.label}
                </span>
                <span className="text-right tabular-nums text-[12.5px] text-text-muted">{l.leads}</span>
                <span className="flex items-center gap-2 min-w-0 text-[12.5px]">
                  <StatusBadge tone={via.tone}>{via.text}</StatusBadge>
                  {l.rep_name && (
                    <span className="truncate" title={l.rep_email}>
                      {l.rep_name}
                    </span>
                  )}
                </span>
                {editable ? (
                  <span className="flex items-center gap-1.5 min-w-0">
                    {sugg.map((s) => (
                      <button key={s.email} type="button" onClick={() => setPicked((p) => ({ ...p, [l.label_key]: s.email }))} title={`${s.name} — ${s.email}. Fills the picker; press Link to save.`} className="shrink-0 max-w-[140px] truncate h-7 px-2 rounded-full border border-primary/40 bg-primary-tint text-primary text-[11px] font-semibold">
                        {sugg.filter((x) => x.name === s.name).length > 1 ? `${s.name} (${s.email.split('@')[0]})` : s.name}
                      </button>
                    ))}
                    <select aria-label={`Employee for ${l.label}`} value={choice} onChange={(e) => setPicked((p) => ({ ...p, [l.label_key]: e.target.value }))} className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-2 text-[12px] text-text outline-none focus:border-primary">
                      <option value="">Choose an employee…</option>
                      {employees.map((e) => (
                        <option key={e.email} value={e.email}>
                          {e.name}
                          {e.dept ? ` (${e.dept})` : ''}
                        </option>
                      ))}
                    </select>
                    <button type="button" disabled={!choice || busy === l.label_key} onClick={() => link(l)} className={`${BTN} shrink-0 !bg-primary !text-white !border-primary`}>
                      {l.via === 'alias' ? 'Relink' : 'Link'}
                    </button>
                    {l.via === 'alias' && (
                      <button type="button" disabled={busy === l.label_key} onClick={() => unlink(l)} className={`${BTN} shrink-0`}>
                        Unlink
                      </button>
                    )}
                  </span>
                ) : (
                  <span className="text-[12px] text-text-muted">Matched automatically — nothing to do.</span>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
