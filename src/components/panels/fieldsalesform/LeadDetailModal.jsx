import { useEffect, useState } from 'react'
import { LEAD_STATE_LABEL, LEAD_STATE_TONE, OUTCOME_LABEL, OUTCOME_TONE, currentUserId, fetchLeadDetail, formatDateTime, formatMoney, formatPlain, friendlyError } from '../../../lib/fieldSalesVisits'
import Icon from '../../shared/Icon'
import OverlayShell from '../../shared/OverlayShell'
import StatusBadge from '../../shared/table/StatusBadge'
import { BTN_PRIMARY } from './visitFormStyles'

// Read-only detail of one Field Sales lead: its details and every visit with its STATE — completed, pending (the demo was not given), or superseded (a
// demo-not-given visit that a LATER completed visit has replaced). Every Discovery visit shows a Meeting badge: it counts as a meeting in any state. The visits' photos are not shown here yet (they sit in a private bucket and need
// signed links — a later round). Long text wraps here (the fixed-height rule is about table rows). The lead's creator also gets "Log a follow-up", which
// opens the Visit Form on it. Props: summary (the list row), admin, canFollowUp (field_sales_form_create), onClose(), onFollowUp(summary).
const VISIT_TONE = { completed: 'success', pending: 'warning', superseded: 'neutral' }
const VISIT_LABEL = { completed: 'Completed', pending: 'Demo not given', superseded: 'Superseded' }
const yn = (b) => (b === true ? 'Yes' : b === false ? 'No' : '—')

// The rows that describe one visit (only what applies to it).
function visitRows(v, admin) {
  const rows = [['Purpose', v.purpose === 'Discovery' ? 'Discovery' : `Follow-up — ${v.follow_up_reason}`]]
  if (v.demo_given !== null && v.demo_given !== undefined) rows.push(['Demo given', yn(v.demo_given)])
  if (v.demo_outcome === 'quotation_to_be_sent') rows.push(['Outcome', `Quotation to be sent on ${formatPlain(v.quotation_due_date)}`])
  if (v.demo_outcome === 'not_interested') rows.push(['Outcome', 'Not interested'])
  if (v.no_demo_reason) rows.push(['Why the demo was not given', v.no_demo_reason])
  if (v.quotation_outcome === 'won') rows.push(['Outcome', `Won — SO ${v.so_number}, ${formatMoney(v.won_amount)}`])
  if (v.quotation_outcome === 'lost') rows.push(['Outcome', 'Lost'])
  if (v.quotation_outcome === 'next_followup') rows.push(['Outcome', 'Next follow-up'])
  if (v.quotation_followup_reason) rows.push(['Why a next follow-up', v.quotation_followup_reason])
  if (v.closing_reason) rows.push([v.quotation_outcome === 'lost' ? 'Reason for loss' : 'Reason for not interested', v.closing_reason])
  if (v.next_followup_date) rows.push(['Next follow-up', formatPlain(v.next_followup_date)])
  if (v.remarks) rows.push(['Remarks', v.remarks])
  if (admin) rows.push(['Logged by', v.entered_by_name || v.entered_by_email || '—'])
  return rows
}

export default function LeadDetailModal({ summary, admin, canFollowUp, onClose, onFollowUp }) {
  const [res, setRes] = useState({ id: null, lead: null, visits: [], error: '', uid: '' })
  const leadId = summary?.lead_id
  useEffect(() => {
    if (!leadId) return
    let cancelled = false
    Promise.all([fetchLeadDetail(leadId), currentUserId().catch(() => '')])
      .then(([d, uid]) => !cancelled && setRes({ id: leadId, lead: d.lead, visits: d.visits, error: '', uid }))
      .catch((e) => !cancelled && setRes({ id: leadId, lead: null, visits: [], error: friendlyError(e), uid: '' }))
    return () => {
      cancelled = true
    }
  }, [leadId])
  if (!summary) return null
  const loading = res.id !== leadId
  const { lead, visits, error } = res
  const mine = !!res.uid && summary.created_by === res.uid

  const info = lead
    ? [
        ['Contact', [lead.contact_person, lead.contact_number].filter(Boolean).join(' · ')],
        ['Location', [lead.area, lead.city].filter(Boolean).join(', ')],
        ['Fleet size', lead.fleet_size],
        ['GPS today', lead.uses_gps ? `Yes — ${lead.existing_gps}` : 'No'],
        ['Source', lead.source_of_lead + (lead.referrer_name ? ` (referred by ${lead.referrer_name})` : '')],
        ['Booked by Sales Coordinator', yn(lead.coordinator_booked)],
        ['Pain area', lead.pain_area],
        ['Added', formatDateTime(lead.created_at)],
        ...(admin ? [['Rep', lead.created_by_name || lead.created_by_email || '—']] : []),
        ...(lead.adopted_from ? [['Taken over from', lead.adopted_from === 'enquiry' ? 'the Enquiry Capture Sheet' : 'SCOT Calls']] : []),
      ]
    : []

  return (
    <OverlayShell open onClose={onClose} maxWidth="max-w-xl" closeIcon={<Icon name="x" size={16} />}>
      <div className="text-[17px] font-extrabold text-text mb-1 pr-10 break-words">{summary.business_name}</div>
      <div className="flex flex-wrap gap-2 mb-4">
        <StatusBadge tone={LEAD_STATE_TONE[summary.lead_state] || 'neutral'}>{LEAD_STATE_LABEL[summary.lead_state] || summary.lead_state}</StatusBadge>
        <StatusBadge tone={OUTCOME_TONE[summary.outcome] || 'neutral'}>{OUTCOME_LABEL[summary.outcome] || summary.outcome}</StatusBadge>
        {summary.followup_overdue && <StatusBadge tone="danger">Follow-up overdue</StatusBadge>}
      </div>

      {loading && (
        <div className="flex items-center gap-2 py-6 text-text-muted text-[13px]">
          <Icon name="loader" size={15} />
          Loading…
        </div>
      )}
      {!loading && error && (
        <div role="alert" className="py-4 text-[13px] text-danger">
          Couldn&apos;t load this lead: {error}
        </div>
      )}
      {!loading && !error && lead && (
        <>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-2 text-[13px] mb-5" data-role="lead-info">
            {info.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-text-muted font-semibold">{label}</dt>
                <dd className="m-0 break-words">{value === null || value === undefined || value === '' ? '—' : value}</dd>
              </div>
            ))}
          </dl>

          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted pb-1.5 mb-2 border-b border-border">Visits ({visits.length})</div>
          {!visits.length && <div className="text-[13px] text-text-muted py-2">No visits yet.</div>}
          <ol className="m-0 p-0 list-none flex flex-col gap-3" data-role="visits">
            {visits.map((v) => (
              <li key={v.id} data-visit-state={v.visit_state} className={`rounded-xl border border-border px-3.5 py-3 ${v.visit_state === 'superseded' ? 'bg-surface-2 opacity-80' : 'bg-surface'}`}>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="text-[12.5px] font-semibold text-text">{formatDateTime(v.created_at)}</div>
                  <span className="inline-flex items-center gap-1.5">
                    {v.purpose === 'Discovery' && (
                      <span title="Every Discovery visit counts as a meeting, whether or not the demo was given">
                        <StatusBadge tone="primary">Meeting</StatusBadge>
                      </span>
                    )}
                    <span title={v.visit_state === 'superseded' ? 'A later visit gave the demo, so this visit was replaced. A Discovery visit still counts as a meeting.' : undefined}>
                      <StatusBadge tone={VISIT_TONE[v.visit_state] || 'neutral'}>{VISIT_LABEL[v.visit_state] || v.visit_state}</StatusBadge>
                    </span>
                  </span>
                </div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-1.5 text-[13px] m-0">
                  {visitRows(v, admin).map(([label, value]) => (
                    <div key={label + value} className="contents">
                      <dt className="text-text-muted font-semibold">{label}</dt>
                      <dd className="m-0 break-words">{value}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ol>

          {canFollowUp && mine && summary.outcome === 'open' && (
            <div className="mt-5">
              <button type="button" onClick={() => onFollowUp(summary)} className={BTN_PRIMARY} data-role="log-followup">
                <Icon name="plus" size={15} />
                Log a follow-up
              </button>
            </div>
          )}
        </>
      )}
    </OverlayShell>
  )
}
