import { useEffect, useState } from 'react'
import Icon from '../../shared/Icon'
import { diffTargets, fetchMecaDirectory, fetchMecaSummary, fmtMoney, monthsOfYear, setSalesRepTargets, targetsFromSummary } from '../../../lib/salesMeca'
import { todayIST } from '../../../lib/fmsFormat'

const BTN = 'inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg border border-border bg-transparent text-text-muted text-[12px] font-semibold hover:bg-surface-2 hover:text-text disabled:opacity-50'
const TH = 'px-1.5 py-2 font-semibold text-text-muted uppercase text-[10px] tracking-wide whitespace-nowrap text-right'
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Setup › Targets. One monthly turnover target per rep (the only thing stored): a grid of reps × the twelve months of the chosen
// year. An empty box means no target for that month; 0 is a real target of nothing. Quarter and year targets are the sum of their
// months and a week's is worked out from its month by days — they are never typed. Only the boxes that changed are saved.
// The reps are everyone the report already knows (linked to a name, or with a Field Sales entry, or with a target); "Add a rep"
// brings in any other employee.
// Props: notify(toast), onChanged() — the report behind this modal must refetch, dirty / onDirty(bool) — unsaved edits (the modal owns
// the flag, because it asks before closing or switching tab)
export default function MecaTargetsTab({ notify, onChanged, dirty, onDirty }) {
  const [year, setYear] = useState(() => Number(todayIST().slice(0, 4)))
  const [reload, setReload] = useState(0)
  const [loaded, setLoaded] = useState({ key: null, reps: [], stored: {}, employees: [], error: '' })
  const key = `${year}|${reload}`

  useEffect(() => {
    if (loaded.key === key) return undefined
    let cancelled = false
    Promise.all([fetchMecaSummary({ from: `${year}-01-01`, to: `${year}-12-31`, bucket: 'month' }), fetchMecaDirectory()])
      .then(([summary, dir]) => {
        if (cancelled) return
        const { reps, stored } = targetsFromSummary(summary)
        setLoaded({ key, reps, stored, employees: dir.employees, error: '' })
      })
      .catch((e) => !cancelled && setLoaded({ key, reps: [], stored: {}, employees: [], error: e.message }))
    return () => {
      cancelled = true
    }
  }, [key, loaded.key, year])

  const loading = loaded.key !== key
  const goYear = (delta) => {
    if (dirty && !confirm('Discard your unsaved targets?')) return
    onDirty(false)
    setYear((y) => y + delta)
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-3 min-h-8 flex-wrap">
        <div className="inline-flex items-center gap-1.5">
          <button type="button" aria-label="Previous year" onClick={() => goYear(-1)} className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-border bg-transparent text-text-muted hover:bg-surface-2">
            <Icon name="chevron-left" size={16} />
          </button>
          <span className="inline-block w-[64px] text-center text-[14px] font-semibold text-text" data-role="targets-year">
            {year}
          </span>
          <button type="button" aria-label="Next year" onClick={() => goYear(1)} className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-border bg-transparent text-text-muted hover:bg-surface-2">
            <Icon name="chevron-right" size={16} />
          </button>
        </div>
        <span className="text-[12.5px] text-text-muted">Monthly turnover target per rep. Leave a month empty for no target.</span>
      </div>

      <div className="min-h-[430px]">
        {loading && <div className="py-24 text-center text-text-muted text-[13px]">Loading the targets…</div>}
        {!loading && loaded.error && (
          <div className="py-16 text-center text-danger text-[13px]">
            Could not load the targets: {loaded.error}
            <div className="mt-3">
              <button type="button" className={BTN} onClick={() => setReload((n) => n + 1)}>
                Retry
              </button>
            </div>
          </div>
        )}
        {!loading && !loaded.error && <TargetsEditor key={key} year={year} reps0={loaded.reps} stored={loaded.stored} employees={loaded.employees} notify={notify} onDirty={onDirty} onSaved={() => { setReload((n) => n + 1); onChanged() }} />}
      </div>
    </div>
  )
}

function TargetsEditor({ year, reps0, stored, employees, notify, onDirty, onSaved }) {
  const months = monthsOfYear(year)
  const [reps, setReps] = useState(reps0)
  const [form, setForm] = useState(() => Object.fromEntries(reps0.map((r) => [r.email, Object.fromEntries(months.map((m) => [m, stored[r.email]?.[m] ?? '']))])))
  const [busy, setBusy] = useState(false)
  const diff = diffTargets(stored, form)
  const dirty = diff.changes.length > 0 || !!diff.error

  useEffect(() => {
    onDirty(dirty)
    return () => onDirty(false)
  }, [dirty, onDirty])

  const set = (email, month, value) => setForm((f) => ({ ...f, [email]: { ...f[email], [month]: value } }))
  const addable = employees.filter((e) => !reps.some((r) => r.email === e.email))
  function addRep(email) {
    const e = employees.find((x) => x.email === email)
    if (!e) return
    setReps((r) => [...r, { email: e.email, name: e.name }])
    setForm((f) => ({ ...f, [e.email]: Object.fromEntries(months.map((m) => [m, ''])) }))
  }
  const rowTotal = (email) => months.reduce((s, m) => s + (Number.isFinite(Number(form[email][m])) && String(form[email][m]).trim() !== '' ? Number(form[email][m]) : 0), 0)

  async function save() {
    if (busy) return
    if (diff.error) return notify({ tone: 'error', text: diff.error })
    if (!diff.changes.length) return
    setBusy(true)
    let done = 0
    try {
      for (const c of diff.changes) {
        await setSalesRepTargets(c.email, c.items)
        done += 1
      }
      notify({ tone: 'success', text: `Targets saved for ${done} rep${done === 1 ? '' : 's'}.` })
    } catch (e) {
      const failed = reps.find((r) => r.email === diff.changes[done].email)
      notify({ tone: 'error', text: `${done ? `Saved for ${done} rep${done === 1 ? '' : 's'}. ` : ''}Could not save ${failed?.name || diff.changes[done].email}: ${e.message}${diff.changes.length - done > 1 ? ' The other changes were not saved.' : ''}` })
    } finally {
      setBusy(false)
      onSaved() // reload from the database either way, so the grid shows what is really stored
    }
  }

  return (
    <div>
      <div className="rounded-lg border border-border max-h-[352px] overflow-auto" data-role="targets-grid">
        <div>
          <table className="w-full min-w-[1308px] text-[12.5px] border-collapse">
            <thead className="sticky top-0 bg-surface z-10">
              <tr className="border-b border-border">
                <th className="px-3 py-2 font-semibold text-text-muted uppercase text-[10px] tracking-wide text-left w-[190px] min-w-[190px]">Rep</th>
                {months.map((m, i) => (
                  <th key={m} className={`${TH} w-[84px] min-w-[84px]`}>
                    {MONTH_SHORT[i]}
                  </th>
                ))}
                <th className={`${TH} w-[110px] min-w-[110px] pr-3`}>Year</th>
              </tr>
            </thead>
            <tbody>
              {!reps.length && (
                <tr>
                  <td colSpan={14} className="py-12 text-center text-text-muted text-[13px]">
                    No reps yet — add one below.
                  </td>
                </tr>
              )}
              {reps.map((r) => (
                <tr key={r.email} className="h-11 border-b border-border last:border-b-0" data-rep={r.email}>
                  <td className="px-3 w-[190px] min-w-[190px] max-w-[190px] truncate font-semibold text-text" title={r.email}>
                    {r.name}
                  </td>
                  {months.map((m) => (
                    <td key={m} className="px-1 w-[84px] min-w-[84px]">
                      <input
                        inputMode="decimal"
                        aria-label={`${r.name} ${m.slice(0, 7)}`}
                        value={form[r.email][m]}
                        onChange={(e) => set(r.email, m, e.target.value)}
                        className="h-8 w-[76px] rounded-lg border border-border bg-surface-2 px-2 text-right tabular-nums text-[12px] text-text outline-none focus:border-primary"
                      />
                    </td>
                  ))}
                  <td className="px-3 w-[110px] min-w-[110px] text-right tabular-nums text-text-muted whitespace-nowrap">{fmtMoney(rowTotal(r.email))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center gap-3 mt-3 flex-wrap">
        <select aria-label="Add a rep" value="" onChange={(e) => addRep(e.target.value)} className="h-8 w-[260px] rounded-lg border border-border bg-surface-2 px-2 text-[12px] text-text outline-none focus:border-primary">
          <option value="">Add a rep…</option>
          {addable.map((e) => (
            <option key={e.email} value={e.email}>
              {e.name}
              {e.dept ? ` (${e.dept})` : ''}
            </option>
          ))}
        </select>
        <span className="text-[11.5px] text-text-muted">Quarter and year targets add up their months; a week’s is worked out from its month by days.</span>
        <button type="button" disabled={!dirty || busy} onClick={save} className={`${BTN} ml-auto !bg-primary !text-white !border-primary`}>
          {busy ? 'Saving…' : 'Save targets'}
        </button>
      </div>
    </div>
  )
}
