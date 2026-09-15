// One initial-chip for person columns. `color`/`bg` are an escape hatch for
// modules with a real color mapping of their own (e.g. SmartFleet's 5-rep
// map, via its existing repColor()/repBg() — pass both through unchanged,
// don't let them fall back to the hash below). With no mapping, `name`
// alone derives a deterministic color and its own tinted background.
const PALETTE = ['#2563EB', '#7C3AED', '#DB2777', '#EA580C', '#16A34A', '#0891B2', '#CA8A04']

function hashColor(seed) {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]
}

export default function AvatarChip({ name, photoUrl, color, bg, size = 'sm' }) {
  const dim = size === 'md' ? 'w-7 h-7 text-[11px]' : 'w-6 h-6 text-[10px]'
  if (photoUrl) return <img src={photoUrl} alt="" className={`${dim} rounded-full object-cover shrink-0`} />
  const resolvedColor = color || hashColor(name || '?')
  const resolvedBg = bg || resolvedColor + '26'
  return (
    <span className={`${dim} rounded-full flex items-center justify-center font-bold shrink-0`} style={{ background: resolvedBg, color: resolvedColor }}>
      {(name || '?').trim()[0]?.toUpperCase() || '?'}
    </span>
  )
}
