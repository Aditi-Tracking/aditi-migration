import { useEffect, useState } from 'react'
import Icon from '../../shared/Icon'
import OverlayShell from '../../shared/OverlayShell'
import { MECA_LEADS_LIMIT, SOURCE_LABELS, bucketLabel, cellBands, fetchMecaLeads, fmtMoney } from '../../../lib/salesMeca'
import { fmtDay } from '../../../lib/fmsFormat'
import MetricCells from './MetricCells'
import { MECA_COL } from './mecaColumns'
import Td from '../../shared/table/Td'

const TH = 'px-3 py-2 font-semibold text-text-muted uppercase text-[10px] tracking-wide whitespace-nowrap text-left'
const LIST = 'h-[216px] overflow-y-auto rounded-lg border border-border'

// The detail of ONE rep (or one period of the rep's own results): the periods that make up the number (when the caller has them) and
// the actual leads behind the Meetings and the Clients — every number on this screen can be traced to a list of names here.
// The leads are read when it opens (sales_meca_leads): a rep always gets their own whatever is asked, an admin names the rep by e-mail
// or an unmapped label.
// The company's own detail (an admin clicked the Company total row) is the period breakdown alone: noLeads — the database lists leads for ONE rep.
// Props: title, subtitle, repEmail, repLabel, from, to, rep (the report's rep — or the company — for the period breakdown), company (the company's
// cells, to colour a rep's Avg Rs Sale and Conversion against; leave out for the company itself or when the viewer cannot see it), noLeads, period +
// buckets (to label that breakdown), onClose
export default function MecaDetailModal({ title, subtitle, repEmail, repLabel, from, to, rep, company = null, noLeads = false, period, buckets, onClose }) {
  const key = `${repEmail || ''}|${repLabel || ''}|${from}|${to}`
  const [loaded, setLoaded] = useState({ key: null, meetings: [], clients: [], error: '' })
  const [nonce, setNonce] = useState(0)
  const request = `${key}|${nonce}`

  useEffect(() => {
    if (noLeads || loaded.key === request) return undefined
    let cancelled = false
    const ask = (kind) => fetchMecaLeads({ repEmail, repLabel, from, to, kind })
    Promise.all([ask('meetings'), ask('clients')])
      .then(([meetings, clients]) => !cancelled && setLoaded({ key: request, meetings, clients, error: '' }))
      .catch((e) => !cancelled && setLoaded({ key: request, meetings: [], clients: [], error: e.message }))
    return () => {
      cancelled = true
    }
  }, [request, loaded.key, noLeads, repEmail, repLabel, from, to])

  const loading = !noLeads && loaded.key !== request
  const multiMonth = period && period.from.slice(0, 7) !== period.to.slice(0, 7)
  const multiYear = period && period.from.slice(0, 4) !== period.to.slice(0, 4)

  return (
    <OverlayShell open onClose={onClose} maxWidth="max-w-7xl" closeIcon={<Icon name="x" size={16} />}>
      <div className="text-[17px] font-extrabold text-text break-words pr-10">{title}</div>
      <div className="text-[12.5px] text-text-muted mb-4 break-words">{subtitle}</div>

      {rep && period && buckets && (
        <div className="mb-4 rounded-lg border border-border overflow-x-auto">
          <table className="w-full text-[12.5px] border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className={`${TH} ${MECA_COL.name}`}>Period</th>
                {['Meetings', 'Clients', 'Conversion', 'Turnover', 'Avg Rs Sale', 'Target', '% of target', 'Gap'].map((h) => (
                  <th key={h} className={`${TH} text-right`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {buckets.map((b, i) => (
                <tr key={b.start} className="h-9 border-b border-border even:bg-border/15">
                  <Td className={`${MECA_COL.name} truncate font-semibold text-text whitespace-nowrap`}>{bucketLabel(period.bucket, b.start, b.end, { multiMonth, multiYear })}</Td>
                  <MetricCells cell={rep.cells[i]} bands={noLeads ? null : cellBands(rep.cells[i], company ? company.cells[i] : null)} />
                </tr>
              ))}
              <tr className="h-9 bg-primary-tint/50">
                <Td className={`${MECA_COL.name} font-bold text-text`}>Total</Td>
                <MetricCells cell={rep.total} strong bands={noLeads ? null : cellBands(rep.total, company ? company.total : null)} />
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {noLeads ? null : !loading && loaded.error ? (
        <div className="py-8 text-center text-danger text-[13px]">
          Could not load the leads: {loaded.error}
          <div className="mt-3">
            <button type="button" onClick={() => setNonce((n) => n + 1)} className="px-3.5 py-2 rounded-lg border-[1.5px] border-danger text-danger text-[12.5px] font-bold bg-transparent">
              Retry
            </button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <section aria-label="Meetings">
            <div className="text-[12.5px] font-semibold text-text mb-1.5">Meetings{!loading && ` (${loaded.meetings.length})`}</div>
            <div className={LIST} data-role="meetings-list">
              {loading ? (
                <div className="py-10 text-center text-text-muted text-[13px]">Loading…</div>
              ) : !loaded.meetings.length ? (
                <div className="py-10 text-center text-text-muted text-[13px]">No meetings in this period.</div>
              ) : (
                <table className="w-full text-[12.5px] border-collapse">
                  <thead className="sticky top-0 bg-surface">
                    <tr className="border-b border-border">
                      <th className={TH}>Date</th>
                      <th className={TH}>Lead</th>
                      <th className={TH}>Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loaded.meetings.map((l, i) => (
                      <tr key={i} className="h-8 border-b border-border last:border-b-0">
                        <Td className="whitespace-nowrap tabular-nums">{fmtDay(l.date)}</Td>
                        <Td className="max-w-[170px] truncate" title={[l.name, l.company].filter(Boolean).join(' · ')}>
                          {l.name || '—'}
                        </Td>
                        <Td className="whitespace-nowrap text-text-muted">{SOURCE_LABELS[l.source] || l.source}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          <section aria-label="Clients">
            <div className="text-[12.5px] font-semibold text-text mb-1.5">Clients{!loading && ` (${loaded.clients.length})`}</div>
            <div className={LIST} data-role="clients-list">
              {loading ? (
                <div className="py-10 text-center text-text-muted text-[13px]">Loading…</div>
              ) : !loaded.clients.length ? (
                <div className="py-10 text-center text-text-muted text-[13px]">No clients won in this period.</div>
              ) : (
                <table className="w-full text-[12.5px] border-collapse">
                  <thead className="sticky top-0 bg-surface">
                    <tr className="border-b border-border">
                      <th className={TH}>Closed</th>
                      <th className={TH}>Lead</th>
                      <th className={`${TH} text-right`}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loaded.clients.map((l, i) => (
                      <tr key={i} className="h-8 border-b border-border last:border-b-0">
                        <Td className="whitespace-nowrap tabular-nums">{fmtDay(l.date)}</Td>
                        <Td className="max-w-[170px] truncate" title={[l.name, l.company].filter(Boolean).join(' · ')}>
                          {l.name || '—'}
                        </Td>
                        <Td align="right" className="whitespace-nowrap tabular-nums">
                          {l.amount === null || l.amount === undefined ? <span className="text-[#B77900]">No amount</span> : fmtMoney(l.amount)}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </div>
      )}
      {!noLeads && (
        <div className="mt-2 min-h-[16px] text-[11.5px] text-text-muted">
          {!loading && (loaded.meetings.length >= MECA_LEADS_LIMIT || loaded.clients.length >= MECA_LEADS_LIMIT) && `Each list shows the first ${MECA_LEADS_LIMIT} only — choose a shorter period to see the rest.`}
        </div>
      )}
    </OverlayShell>
  )
}
