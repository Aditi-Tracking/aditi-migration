import { useEffect, useState } from 'react'
import { useLeadCaptureAccess } from '../../../context/LeadCaptureAccessContext'
import { canAccessSalesMeca, canManageSalesMeca, canViewAllSalesMeca } from '../../../lib/salesMecaPermissions'
import { DEFAULT_RANGE, buildReport, fetchMecaSummary, rangeFor, warningLines } from '../../../lib/salesMeca'
import { todayIST } from '../../../lib/fmsFormat'
import Icon from '../../shared/Icon'
import Toast from '../../shared/Toast'
import MecaRangeFilter from './MecaRangeFilter'
import MecaWarnings from './MecaWarnings'
import MecaRepTable from './MecaRepTable'
import MecaDetailModal from './MecaDetailModal'
import MecaSetupModal from './MecaSetupModal'
import { useLeadSync } from '../leadcapture/leadSync'

// The tab's ONE date filter (MecaRangeFilter): This Week (the default) · Previous Week · This Month · Last Month · Last 3 Months · Custom. It replaces the Month / Quarter /
// Year bar, which was switched off; that code (periodFor, MecaDateBar) stays in the codebase, dormant.
const initialSelection = () => ({ key: DEFAULT_RANGE, from: '', to: '' })

// Sales Rep MeCa — the fourth tab of Lead Capture (LeadCapturePanel owns the page title, breadcrumb and padding; this renders without
// any): how each sales rep is doing — meetings, clients won, conversion, turnover and average sale — against a monthly target, for a
// month, quarter or year. Read-only reporting; see lib/salesMeca.js for what every number means and for the colour bands.
//   rep (sales_meca_view)        sees one row: their OWN results; clicking it opens their periods and leads
//   admin (sales_meca_view_all)  sees one table: the Company total (click it for the company's periods) and a row per rep (click for theirs)
//   admin who may manage         also gets the Set up gear: link Sales Person names to employees, set monthly targets
// Same request pattern as the other tabs: the selection plus a refetch nonce form a request key; the loaded result remembers the key
// (and the period) it answers, so "loading" is derived, a superseded response is dropped, and the previous result stays on screen,
// dimmed, until the new one arrives. Messages are toasts, never inline banners; data warnings are one link in the bar.
export default function SalesMecaPanel() {
  const { permissions } = useLeadCaptureAccess()
  const isAll = canViewAllSalesMeca(permissions)
  const canManage = canManageSalesMeca(permissions)
  const [sel, setSel] = useState(initialSelection)
  const [sort, setSort] = useState(null)
  const [nonce, setNonce] = useState(0)
  const [result, setResult] = useState({ key: null, report: null, period: null, error: '' })
  const [toast, setToast] = useState(null)
  const [detail, setDetail] = useState(null)
  const [setup, setSetup] = useState(false)

  const syncKey = useLeadSync({ holdFocus: !!detail || setup }) // another tab changed something, or the window came back
  const period = rangeFor(sel, todayIST()) // India's today: a tab left open overnight moves on by itself at the next refetch
  const requestKey = period.error ? null : `${nonce}|${syncKey}|${period.from}|${period.to}|${period.bucket}|${period.totalsBucket}`

  useEffect(() => {
    if (!requestKey || result.key === requestKey) return undefined
    let cancelled = false
    const p = rangeFor(sel, todayIST())
    Promise.all([fetchMecaSummary(p), fetchMecaSummary({ from: p.from, to: p.to, bucket: p.totalsBucket })])
      .then(([summary, totals]) => !cancelled && setResult({ key: requestKey, report: buildReport(summary, totals), period: p, error: '' }))
      .catch((e) => !cancelled && setResult((r) => ({ key: requestKey, report: r.report, period: r.period, error: e.message })))
    return () => {
      cancelled = true
    }
  }, [requestKey, result.key, sel])

  if (!canAccessSalesMeca(permissions)) {
    return <div className="px-4 sm:px-6 py-16 text-center text-text-muted text-[13px]">You don't have access to this dashboard.</div>
  }

  const loading = !!requestKey && result.key !== requestKey
  const firstLoad = result.report === null && !result.error
  const failed = !loading && !!requestKey && !!result.error
  const { report } = result
  const shown = result.period || period // the period the report on screen answers
  const notLinked = report && !report.me.is_all && !report.me.linked

  const refetch = () => setNonce((n) => n + 1)
  const changeSort = (key, dir) => setSort(dir ? { key, dir } : null)

  const openRep = (rep) =>
    setDetail({ title: rep.name, subtitle: `${shown.label}${rep.unmapped ? ' — no employee is linked to this Sales Person name yet' : ` · ${rep.email}`}`, repEmail: rep.email, repLabel: rep.label, from: shown.from, to: shown.to, rep, company: isAll ? report.company : null, period: shown, buckets: report.buckets })
  const openCompany = () => setDetail({ title: 'Company', subtitle: `${shown.label} · all sales reps`, repEmail: null, repLabel: null, from: shown.from, to: shown.to, rep: report.company, noLeads: true, period: shown, buckets: report.buckets })

  return (
    <div>
      <MecaRangeFilter value={sel} onChange={setSel} range={period}>
        {report && <MecaWarnings lines={warningLines(report.warnings, isAll)} canSetup={canManage && isAll} onSetup={() => setSetup(true)} />}
        {canManage && (
          <button type="button" aria-label="Set up" title="Set up — link Sales Person names to employees, set monthly targets" onClick={() => setSetup(true)} className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-border bg-transparent text-text-muted hover:bg-surface-2 hover:text-text">
            <Icon name="settings" size={16} />
          </button>
        )}
      </MecaRangeFilter>

      {period.error && <div className="text-center py-10 text-text-muted text-[13px]">Choose a valid date range to see the report.</div>}
      {!period.error && firstLoad && loading && <div className="text-center py-10 text-text-muted text-[13px]">Loading the report…</div>}
      {failed && (
        <div className="text-center py-10 text-danger text-[13px]">
          Could not load the report: {result.error}
          <div className="mt-3">
            <button type="button" onClick={refetch} className="px-3.5 py-2 rounded-lg border-[1.5px] border-danger text-danger text-[12.5px] font-bold bg-transparent">
              Retry
            </button>
          </div>
        </div>
      )}

      {!period.error && !failed && report && (
        <div className={loading ? 'opacity-60 pointer-events-none' : ''}>
          {notLinked ? (
            <div className="rounded-xl border border-border bg-surface text-center py-12 px-4 text-text-muted text-[13px]">Your login is not linked to a sales person yet, so there is nothing to show. Ask an admin to link your Sales Person name under Set up.</div>
          ) : (
            <MecaRepTable report={report} isAll={isAll} sort={sort} onSort={changeSort} onOpen={openRep} onOpenCompany={openCompany} />
          )}
        </div>
      )}

      {detail && <MecaDetailModal {...detail} onClose={() => setDetail(null)} />}
      {setup && <MecaSetupModal notify={setToast} onChanged={refetch} onClose={() => setSetup(false)} />}
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  )
}
