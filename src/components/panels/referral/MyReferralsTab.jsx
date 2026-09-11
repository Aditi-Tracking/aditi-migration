// Ported from old-portal/js/referral.js's loadMyReferrals/_refStageDesc.
// Stage badge colors are unified to the single blue palette (primary for
// active stages, muted for the terminal "Closed-Not Eligible" outcome)
// instead of old-portal's 8 distinct hues — presentational only.
const STAGE_DESC = {
  Submitted: 'HR has received your referral and will review it shortly.',
  'Under Review': 'HR is screening the candidate.',
  'Shortlisted/Interview': 'Candidate is progressing through the interview process.',
  'Selected/Offered': 'An offer has been extended to the candidate.',
  Joined: 'Candidate has joined — the 90-day clock has started.',
  '90-Day Completed': 'Candidate completed 90 days — incentive eligible, payout pending.',
  'Incentive Paid': 'Your ₹2,000 incentive has been released.',
  'Closed-Not Eligible': 'Not eligible for incentive (did not join, exited early, or duplicate).',
}

function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function MyReferralsTab({ referrals, loading, error }) {
  if (loading) return <div className="text-center py-16 text-text-muted text-[13px]">Loading your referrals…</div>
  if (error) return <div className="text-center py-16 text-danger text-[13px]">⚠️ {error}</div>
  if (!referrals.length) {
    return (
      <div className="text-center py-12 text-text-muted">
        <div className="text-[13px] font-semibold text-text mb-1">You Haven't Referred Anyone Yet</div>
        <div className="text-[12px]">
          Go to <strong className="text-text">Open Roles</strong> and refer a friend to earn ₹2,000.
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2.5">
      {referrals.map((r) => {
        const isClosed = r.status === 'Closed-Not Eligible'
        let extra = null
        if (r.status === 'Joined' && r.ninety_day_date) {
          extra = <div className="text-[11px] text-text-muted mt-1">Eligible on {fmtDate(r.ninety_day_date)}</div>
        } else if (r.status === 'Incentive Paid' && r.paid_date) {
          extra = (
            <div className="text-[11px] text-primary mt-1">
              Paid on {fmtDate(r.paid_date)} · ₹{r.paid_amount || 2000}
            </div>
          )
        } else if (STAGE_DESC[r.status]) {
          extra = <div className="text-[11px] text-text-muted mt-1">{STAGE_DESC[r.status]}</div>
        }
        return (
          <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3">
            <div className="flex-1 min-w-[180px]">
              <div className="text-[13px] font-semibold text-text">{r.candidate_name}</div>
              <div className="text-[11.5px] text-text-muted mt-0.5">for {r.opening_title || '—'}</div>
              {extra}
            </div>
            <span
              className={`text-[10.5px] font-medium rounded-full px-2.5 py-1 border ${
                isClosed ? 'bg-surface-2 text-text-muted border-border' : 'bg-primary-tint text-primary border-primary/20'
              }`}
            >
              {r.status}
            </span>
          </div>
        )
      })}
    </div>
  )
}
