// Ported from index.html's .esol-switcher markup. Fixed-light styling throughout (literal hex,
// not this project's theme tokens) — see lib/enterpriseSolutions.js's header comment.
export default function EnterpriseSolutionsSwitcher({ tab, onTabChange, clicktaskSub, coolbusSub }) {
  const items = [
    { key: 'clicktask', title: 'ClickTask', sub: clicktaskSub, accent: '#00d4aa', icon: '🗂️' },
    { key: 'coolbus', title: 'CoolBus', sub: coolbusSub, accent: '#4e9af1', icon: '🚌' },
  ]
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
      {items.map((it) => {
        const active = tab === it.key
        return (
          <button
            key={it.key}
            type="button"
            onClick={() => onTabChange(it.key)}
            className="flex items-center gap-3 rounded-2xl border bg-white px-4 py-3.5 text-left"
            style={{ borderColor: active ? it.accent : '#e9ecf5', boxShadow: active ? `0 0 0 1.5px ${it.accent} inset` : '0 1px 2px rgba(15,23,42,0.04)' }}
          >
            <span className="w-11 h-11 rounded-xl flex items-center justify-center text-[20px] shrink-0" style={{ background: it.accent + '29', color: it.accent }}>
              {it.icon}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[14.5px] font-bold text-[#1e293b]">{it.title}</span>
              <span className="block text-[11.5px] text-[#8891a5] truncate">{it.sub}</span>
            </span>
            {active && <span className="text-[16px] font-bold" style={{ color: it.accent }}>✓</span>}
          </button>
        )
      })}
    </div>
  )
}
