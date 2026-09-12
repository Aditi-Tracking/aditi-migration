import { useEffect, useState } from 'react'
import { acknowledgeCustomerAlert, fetchCustomerAlerts } from '../../../lib/crmVehicle'

// Ported from old-portal/js/crm.js's loadCustomerAlerts/crmAcknowledgeAlert. No tier/server
// scoping at all — every viewer who can open the panel sees and can acknowledge every Platinum
// vehicle-count-drop alert company-wide, regardless of their own access level. Ported as-is —
// see MIGRATION-NOTES.md's access-boundary wrinkles.
export default function CustomerAlertsBanner({ currentUser }) {
  const [alerts, setAlerts] = useState([])
  const [acking, setAcking] = useState(null)

  async function load() {
    setAlerts(await fetchCustomerAlerts())
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-time fetch
    load()
  }, [])

  async function handleAcknowledge(id) {
    setAcking(id)
    try {
      await acknowledgeCustomerAlert(id, currentUser?.name)
      await load()
    } catch (e) {
      alert('❌ Failed to acknowledge alert: ' + e.message)
    } finally {
      setAcking(null)
    }
  }

  if (!alerts.length) return null

  return (
    <div className="mb-4 space-y-2">
      {alerts.map((r) => (
        <div key={r.id} className="flex items-center justify-between gap-3 flex-wrap rounded-xl border border-danger/25 bg-danger-tint px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-[18px] shrink-0">⚠️</span>
            <div className="min-w-0">
              <div className="text-[13px] text-text">
                💎 <strong>{r.company_name}</strong>'s vehicle count dropped <strong>{r.pct_drop}%</strong>
              </div>
              <div className="text-[11px] text-text-muted mt-0.5">
                {Math.round(r.baseline_avg)} (7-day average) → {r.current_count} vehicles · {r.alert_date}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleAcknowledge(r.id)}
            disabled={acking === r.id}
            className="shrink-0 text-[12px] font-semibold text-danger border border-danger/30 rounded-md px-3 py-1.5 disabled:opacity-60"
          >
            {acking === r.id ? 'Acknowledging…' : 'Acknowledge'}
          </button>
        </div>
      ))}
    </div>
  )
}
