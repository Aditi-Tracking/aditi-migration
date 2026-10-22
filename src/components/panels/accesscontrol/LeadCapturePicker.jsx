import { useState } from 'react'
import { LC_TIERS, fetchLeadCaptureHistory, tierLabel } from '../../../lib/leadCaptureAccess'

const when = (iso) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })
}

// One person's Lead Capture access in the Access Control panel: ONE picker — None / Field Sales / Sales Person / Admin — in place of the many individual
// Lead Capture switches. A person holds exactly one tier or none (the database makes a second impossible). It is separate from the person's portal role
// and from every other switch on the card. Removing access, or taking Admin away, asks first. A Sales Person login that is not linked to a managed
// Sales Person name is warned about: the Sheet shows that tier only the leads that name resolves to, so an unlinked login sees none.
// Props: person { email, name, tier, assigned_by, assigned_at, linked_sales_person }, saving, saved, error, onChange(tier | null)
export default function LeadCapturePicker({ person, saving, saved, error, onChange }) {
  const [history, setHistory] = useState(null) // null = closed, { loading } | { rows } | { error }
  const tier = person.tier || ''

  function pick(next) {
    const value = next || null
    if (value === person.tier) return
    if (!value && !confirm(`Remove ${person.name}'s Lead Capture access?\n\nThey will no longer see any of the five Lead Capture tabs.`)) return
    if (value && person.tier === 'lc_admin' && !confirm(`Change ${person.name} from Admin to ${tierLabel(value)}?\n\nThey will lose every write they have in Lead Capture.`)) return
    onChange(value)
  }

  async function toggleHistory() {
    if (history) return setHistory(null)
    setHistory({ loading: true })
    try {
      setHistory({ rows: await fetchLeadCaptureHistory(person.email, 20) })
    } catch (e) {
      setHistory({ error: e.message })
    }
  }

  return (
    <div className="mb-3 rounded-lg border border-border bg-surface-2/50 px-3 py-2.5" data-role="lc-picker" data-email={person.email}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="text-[14px] font-semibold text-text">Lead Capture access</div>
          <div className="text-[12.5px] text-text-muted">
            {tier ? LC_TIERS.find((t) => t.value === tier)?.hint : 'No access — the Lead Capture tile is hidden for this person.'}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {saving && <span className="text-[12px] text-text-muted">Saving…</span>}
          {!saving && saved && <span className="text-[12px] text-primary">Saved</span>}
          <select
            value={tier}
            disabled={saving}
            aria-label={`Lead Capture access for ${person.name}`}
            onChange={(e) => pick(e.target.value)}
            className="rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-[13.5px] text-text outline-none min-w-[150px]"
          >
            <option value="">None</option>
            {LC_TIERS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {tier === 'lc_sales_person' && !person.linked_sales_person && (
        <div className="mt-1.5 text-[12.5px] text-[#B77900]" data-role="lc-unlinked">
          This login is not linked to a Sales Person name, so it would see no leads in the Sheet and no numbers in Sales Rep MeCa. Link it under Lead Capture, Sales Rep MeCa, Set up.
        </div>
      )}
      {tier && person.linked_sales_person && <div className="mt-1.5 text-[12.5px] text-text-muted">Linked Sales Person name: {person.linked_sales_person}</div>}
      {error && (
        <div role="alert" className="mt-1.5 text-[12.5px] text-danger">
          {error}
        </div>
      )}
      <div className="mt-1.5 flex items-center gap-3 text-[12px] text-text-muted">
        {person.assigned_at && <span>Set by {person.assigned_by} on {when(person.assigned_at)}</span>}
        <button type="button" data-role="lc-history" onClick={toggleHistory} className="bg-transparent border-none p-0 underline text-primary font-semibold">
          {history ? 'Hide history' : 'History'}
        </button>
      </div>
      {history && (
        <div className="mt-1.5 text-[12.5px]" data-role="lc-history-list">
          {history.loading && <span className="text-text-muted">Loading…</span>}
          {history.error && <span className="text-danger">{history.error}</span>}
          {history.rows && !history.rows.length && <span className="text-text-muted">No changes recorded.</span>}
          {history.rows?.map((h, i) => (
            <div key={i} className="text-text-muted">
              {when(h.at)} — {tierLabel(h.old)} to {tierLabel(h.new)} by {h.by}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
