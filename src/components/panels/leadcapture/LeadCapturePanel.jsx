import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Icon from '../../shared/Icon'
import TabButton from '../../shared/TabButton'
import { useLeadCaptureAccess } from '../../../context/LeadCaptureAccessContext'
import { canAccessEnquiry } from '../../../lib/enquiryPermissions'
import { canAccessFieldSalesForm } from '../../../lib/fieldSalesFormPermissions'
import { canAccessSalesFms } from '../../../lib/salesFmsPermissions'
import { canAccessSalesMeca } from '../../../lib/salesMecaPermissions'
import { canAccessScot } from '../../../lib/scotPermissions'
import { LeadSyncContext, LeadTabContext } from './leadSync'

// Each tab's content is its own lazy chunk: a user with only one of them never downloads the others
// (the Enquiry Capture Sheet brings the 490 kB Excel library with it).
const FieldSalesFormPanel = lazy(() => import('../fieldsalesform/FieldSalesFormPanel'))
const EnquiryPanel = lazy(() => import('../enquiry/EnquiryPanel'))
const SalesFmsPanel = lazy(() => import('../salesfms/SalesFmsPanel'))
const SalesMecaPanel = lazy(() => import('../salesmeca/SalesMecaPanel'))
const ScotPanel = lazy(() => import('../scot/ScotPanel'))

// Lead Capture — the one Dashboards entry point for the lead pipeline. Five tabs, each a module with its own table,
// permission keys and logic (see lib/fieldSalesForm.js, lib/enquiries.js, lib/salesFms.js, lib/salesMeca.js and lib/scot.js), shown only to
// those who may use it:
//   Field Sales Form          field_sales_form_view  (a rep logs a lead from the field; entries table + New Entry modal)
//   Enquiry Capture Sheet     enquiry_view           (the spreadsheet-style enquiry list; Bulk Upload; Send to FMS)
//   Sales FMS                 sales_fms_view         (the pipeline of every lead sent to FMS: 5 stages, planned vs actual, what is overdue)
//   Sales Rep MeCa            sales_meca_view / _view_all  (meetings, clients, turnover and target per sales rep; a rep sees only their own)
//   SCOT Calls                scot_view              (the follow-up tracker for lost leads: who to call next, the call log, Excel upload)
// A user with access to only one sees just that content, with no tab bar (the single-tab convention); with two or more the
// bar shows them in this fixed order; a user with none sees the access message (the nav hides the tile for them anyway). The first tab the user can access is
// the default, and the last-used tab is deliberately NOT remembered.
// A tab is MOUNTED the first time it is opened and then kept mounted, hidden via `hidden` when another is showing
// (the Field Service / Task Checklist convention): a half-filled entry form survives a look at the Sheet, while a
// tab that has never been opened costs nothing — no code downloaded, no lists fetched.
// Freshness across tabs (see leadSync.js): a write in one tab marks every OTHER tab stale; a visible tab refetches at once, a hidden one the next
// time it is opened; coming back to the browser window after 30 s away refetches too, so other people's changes show without a page refresh.
// This shell owns the page chrome (title, breadcrumb, padding); the tab contents render without their own.
const TAB_IDS = ['fieldsales', 'enquiry', 'salesfms', 'salesmeca', 'scot']
const AWAY_MS = 30000 // how long the window must have been away before coming back refetches
const EDITING = /^(INPUT|TEXTAREA|SELECT)$/
export default function LeadCapturePanel() {
  const { permissions, loading, error, reload } = useLeadCaptureAccess()
  const tabs = [
    { id: 'fieldsales', label: 'Field Sales Form', allowed: canAccessFieldSalesForm(permissions), Content: FieldSalesFormPanel },
    { id: 'enquiry', label: 'Enquiry Capture Sheet', allowed: canAccessEnquiry(permissions), Content: EnquiryPanel },
    { id: 'salesfms', label: 'Sales FMS', allowed: canAccessSalesFms(permissions), Content: SalesFmsPanel },
    { id: 'salesmeca', label: 'Sales Rep MeCa', allowed: canAccessSalesMeca(permissions), Content: SalesMecaPanel },
    { id: 'scot', label: 'SCOT Calls', allowed: canAccessScot(permissions), Content: ScotPanel },
  ].filter((t) => t.allowed)

  const [chosen, setChosen] = useState(null)
  const [visited, setVisited] = useState(() => new Set())
  const [stale, setStale] = useState({})
  const [focusTick, setFocusTick] = useState(0)
  const notifyChanged = useCallback((source) => setStale((s) => Object.fromEntries(TAB_IDS.map((id) => [id, (s[id] ?? 0) + (id === source ? 0 : 1)]))), [])
  const sync = useMemo(() => ({ stale, focusTick, notifyChanged }), [stale, focusTick, notifyChanged])
  const leftAt = useRef(null)
  useEffect(() => {
    const away = () => {
      if (leftAt.current === null) leftAt.current = Date.now()
    }
    const back = () => {
      const since = leftAt.current
      leftAt.current = null
      // not while the user is typing into a field (a refetch could replace what they are editing) — the next return or write catches up
      if (since !== null && Date.now() - since > AWAY_MS && !EDITING.test(document.activeElement?.tagName || '')) setFocusTick((n) => n + 1)
    }
    const visibility = () => (document.visibilityState === 'hidden' ? away() : back())
    window.addEventListener('blur', away)
    window.addEventListener('focus', back)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      window.removeEventListener('blur', away)
      window.removeEventListener('focus', back)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [])
  // Derived, never an effect: if the choice is unset (or no longer allowed) it is the first allowed tab.
  const current = tabs.some((t) => t.id === chosen) ? chosen : tabs[0]?.id

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-text-muted text-[15px]">
        <Icon name="loader" size={16} />
        Loading…
      </div>
    )
  }
  if (!tabs.length && error) {
    return (
      <div className="px-4 sm:px-6 py-16 text-center text-danger text-[13px]" role="alert">
        Could not check your Lead Capture access: {error}
        <div className="mt-3">
          <button type="button" onClick={reload} className="px-3.5 py-2 rounded-lg border-[1.5px] border-danger text-danger text-[12.5px] font-bold bg-transparent">
            Retry
          </button>
        </div>
      </div>
    )
  }
  if (!tabs.length) {
    return <div className="px-4 sm:px-6 py-16 text-center text-text-muted text-[13px]">You don't have access to this dashboard.</div>
  }

  // Opening a tab records BOTH it and the one being left, so the tab the user started on stays mounted too.
  function open(id) {
    setChosen(id)
    setVisited((v) => new Set(v).add(current).add(id))
  }

  return (
    <LeadSyncContext.Provider value={sync}>
    <div className="px-4 sm:px-6 py-5">
      <div className="mb-4">
        <div className="text-[16px] font-semibold text-text">Lead Capture</div>
        <div className="text-[11.5px] text-text-muted mt-0.5">Home › Lead Capture</div>
      </div>

      {tabs.length > 1 && (
        <div className="flex gap-2 flex-wrap mb-4">
          {tabs.map((t) => (
            <TabButton key={t.id} active={current === t.id} onClick={() => open(t.id)}>
              {t.label}
            </TabButton>
          ))}
        </div>
      )}

      {tabs.map(({ id, Content }) =>
        visited.has(id) || id === current ? (
          <div key={id} hidden={current !== id}>
            <Suspense fallback={<div className="flex items-center justify-center gap-2 py-16 text-text-muted text-[15px]">
                <Icon name="loader" size={16} />
                Loading…
              </div>}>
              <LeadTabContext.Provider value={{ tabId: id, active: current === id }}>
                <Content />
              </LeadTabContext.Provider>
            </Suspense>
          </div>
        ) : null
      )}
    </div>
    </LeadSyncContext.Provider>
  )
}
