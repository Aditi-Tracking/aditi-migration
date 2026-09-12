import { RU_TABS } from '../../../lib/renewals'

// Ported from old-portal/js/renewals.js's ruRenderTabBar — renders only the
// tabs this user is allowed to see AND that are actually built so far
// (Upload/Resolve Unmatched/Overview/Accounts still aren't). If there's
// nothing to switch between, no bar renders at all — not a disabled/hidden
// button, nothing in the DOM to select, matching production exactly.
export default function RenewalsTabBar({ tabs, activeTab, onChange, unassignedPoolCount }) {
  if (tabs.length <= 1) return null

  return (
    <div className="flex gap-1.5 flex-wrap mb-4">
      {RU_TABS.filter((t) => tabs.includes(t.id)).map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={`rounded-lg px-4 py-1.5 text-[12.5px] font-semibold border ${
            activeTab === t.id ? 'bg-primary text-white border-primary' : 'bg-surface-2 text-text-muted border-border'
          }`}
        >
          {t.id === 'unassignedPool' && unassignedPoolCount > 0 ? `${t.label} (${unassignedPoolCount})` : t.label}
        </button>
      ))}
    </div>
  )
}
