import { useLayoutEffect, useRef, useState } from 'react'

// Fixed progression order for the funnel chain — "reached this stage or further", not "currently
// sitting exactly here" (see FUNNEL_ORDER comment below for why that distinction matters). Stages
// not in this list (Lost/Invalid/No Response) are exits from the journey, not progress through
// it, and get their own boxes instead of a slot in the chain.
const FUNNEL_ORDER = ['Future Lead', 'Anticipating Demo', 'Trials In Progress', 'Demo Done', 'Quotation Sent', 'Negotiation', 'PO/LOI', 'Won']

const FUNNEL_COLORS = ['#9ca3af', '#f0a500', '#06b6d4', '#f0a500', '#a78bfa', '#ec4899', '#f0a500', '#00d4aa']

// Builds the funnel's counts straight off the "Last Known Stage" column (CurrentStage): each
// box's number is an exact count of rows whose CurrentStage equals that stage, not a cumulative
// "reached this far or beyond" tally.
function computeJourney(rows) {
  const total = rows.length
  const validCount = rows.filter((r) => r.LeadQuality === 'Valid').length
  const invalidCount = rows.filter((r) => r.LeadQuality === 'Invalid').length
  const lostCount = rows.filter((r) => r.CurrentStage === 'Lost').length
  const noResponseCount = rows.filter((r) => r.CurrentStage === 'No Response').length

  const histogram = new Array(FUNNEL_ORDER.length).fill(0)
  rows.forEach((r) => {
    const idx = FUNNEL_ORDER.indexOf(r.CurrentStage)
    if (idx !== -1) histogram[idx]++
  })
  // "Demo Done" is driven by ReachedDemo (the "Demo by" column), same as the KPI tile — a lead
  // that had its demo and moved on to a later stage no longer reads "Demo Done" in "Last Known
  // Stage", so the exact-match histogram would undercount it.
  const demoDoneIdx = FUNNEL_ORDER.indexOf('Demo Done')
  if (demoDoneIdx !== -1) histogram[demoDoneIdx] = rows.filter((r) => r.ReachedDemo).length
  const funnelCounts = FUNNEL_ORDER.map((stage, i) => ({ stage, count: histogram[i], color: FUNNEL_COLORS[i] }))

  return { total, validCount, invalidCount, lostCount, noResponseCount, funnelCounts }
}

function pct(count, total) {
  return total ? ((count / total) * 100).toFixed(1) : '0'
}

function JourneyBox({ icon, label, count, total, tone, isActive, onClick }) {
  const toneClasses = {
    blue: 'bg-[#eff6ff] border-[#bfdbfe] text-[#1d4ed8]',
    green: 'bg-[#f0fdf4] border-[#bbf7d0] text-[#15803d]',
    gray: 'bg-surface-2 border-border text-text',
    red: 'bg-[#fef2f2] border-[#fecaca] text-[#b91c1c]',
    amber: 'bg-[#fffbeb] border-[#fde68a] text-[#b45309]',
  }
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`shrink-0 w-[140px] rounded-xl border p-3 text-left ${toneClasses[tone] || toneClasses.gray} ${
        isActive ? 'ring-2 ring-primary' : ''
      } ${onClick ? 'cursor-pointer' : ''}`}
    >
      <div className="text-[20px] leading-none mb-2">{icon}</div>
      <div className="text-[12px] font-semibold leading-tight">{label}</div>
      <div className="text-[20px] font-bold mt-1">{count.toLocaleString()}</div>
      <div className="text-[11px] opacity-70">{pct(count, total)}%</div>
    </Comp>
  )
}

// A clean, bold shaft+arrowhead glyph — the plain "→" text character rendered too thin/faint to
// read as a real connector line, which is what the user flagged after comparing against the
// reference image's bold solid arrows.
// `alignToValidRow` is for the one connector (right after TotalSplit) sharing a flex row with a
// taller sibling (the Total/Valid/Invalid cluster) — plain self-center would center it against
// that cluster's full height instead of landing at Valid Leads' height, which is what the funnel
// chain boxes themselves line up with (both start at the row's top edge).
function Arrow({ className = '', dashed = false, alignToValidRow = false }) {
  return (
    <svg
      viewBox="0 0 28 16"
      className={`w-7 h-4 shrink-0 text-text-muted ${alignToValidRow ? 'self-start mt-11' : 'self-center'} ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <line x1="0" y1="8" x2="21" y2="8" strokeDasharray={dashed ? '3 3' : undefined} />
      <polyline points="15 2 22 8 15 14" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// The Total Leads → {Valid, Invalid} split. Percentage-based CSS guesses kept landing the incoming
// branch at the wrong height (the fork's "trunk" height depends on the actual rendered heights of
// the Total box vs. the Valid/Invalid stack, which aren't a clean 50/25/75 split in practice) — so
// this measures the three boxes' real positions with refs and draws the connector as an SVG
// overlay sized to their actual coordinates, which is correct regardless of box height.
function TotalSplit({ journey, statusFilter, onStatusClick }) {
  const wrapRef = useRef(null)
  const totalRef = useRef(null)
  const validRef = useRef(null)
  const invalidRef = useRef(null)
  const [geo, setGeo] = useState(null)

  useLayoutEffect(() => {
    function measure() {
      const wrap = wrapRef.current
      const total = totalRef.current
      const valid = validRef.current
      const invalid = invalidRef.current
      if (!wrap || !total || !valid || !invalid) return
      const w = wrap.getBoundingClientRect()
      const t = total.getBoundingClientRect()
      const v = valid.getBoundingClientRect()
      const inv = invalid.getBoundingClientRect()
      const x0 = t.right - w.left
      const y0 = t.top + t.height / 2 - w.top
      const x1 = v.left - w.left
      const y1 = v.top + v.height / 2 - w.top
      const y2 = inv.top + inv.height / 2 - w.top
      setGeo({ width: w.width, height: w.height, x0, y0, x1, y1, y2 })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [journey.total, journey.validCount, journey.invalidCount])

  return (
    <div ref={wrapRef} className="relative flex items-center gap-12 shrink-0">
      <div ref={totalRef}>
        <JourneyBox icon="👥" label="Total Leads" count={journey.total} total={journey.total} tone="blue" />
      </div>
      <div className="flex flex-col gap-2">
        <div ref={validRef}>
          <JourneyBox icon="✅" label="Valid Leads" count={journey.validCount} total={journey.total} tone="green" />
        </div>
        <div ref={invalidRef}>
          <JourneyBox
            icon="🚫"
            label="Invalid"
            count={journey.invalidCount}
            total={journey.total}
            tone="gray"
            isActive={statusFilter === 'Invalid'}
            onClick={() => onStatusClick('Invalid')}
          />
        </div>
      </div>
      {geo && (
        <svg
          className="absolute inset-0 pointer-events-none text-text-muted"
          width={geo.width}
          height={geo.height}
          style={{ overflow: 'visible' }}
        >
          <defs>
            <marker id="journeyForkHead" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
              <path d="M0,0 L7,3.5 L0,7 Z" fill="currentColor" />
            </marker>
          </defs>
          <path
            d={`M${geo.x0 + 8},${geo.y0} V${geo.y1} H${geo.x1 - 16}`}
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            markerEnd="url(#journeyForkHead)"
          />
          <path
            d={`M${geo.x0 + 8},${geo.y0} V${geo.y2} H${geo.x1 - 16}`}
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            markerEnd="url(#journeyForkHead)"
          />
        </svg>
      )}
    </div>
  )
}

// Per the user's own hand-drawn mockup: a dashed bracket runs from "Anticipating Demo" straight
// down into Lost, and from "PO/LOI" straight down into No Response — each connector touches its
// stage box directly (single anchor, no merge), with a clearly visible drop length rather than a
// barely-there tick.
function FunnelExits({ journey, geo, statusFilter, onStatusClick }) {
  if (!geo) return null
  const { antX, poloiX } = geo
  const busY = 14
  const dropEndY = 85
  const width = poloiX + 40

  return (
    <div className="absolute" style={{ left: 0, top: geo.top, width }}>
      <svg className="absolute top-0 left-0 text-text-muted overflow-visible" width={width} height={dropEndY}>
        <defs>
          <marker id="journeyExitHead" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 Z" fill="currentColor" />
          </marker>
        </defs>
        <path d={`M${antX},0 V${busY} H${poloiX} V0`} stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 4" fill="none" />
        <path
          d={`M${antX},${busY} V${dropEndY - 6}`}
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="3 3"
          fill="none"
          markerEnd="url(#journeyExitHead)"
        />
        <path
          d={`M${poloiX},${busY} V${dropEndY - 6}`}
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="3 3"
          fill="none"
          markerEnd="url(#journeyExitHead)"
        />
      </svg>
      <div className="absolute" style={{ left: antX, top: dropEndY, transform: 'translateX(-50%)' }}>
        <JourneyBox
          icon="❌"
          label="Lost"
          count={journey.lostCount}
          total={journey.validCount}
          tone="red"
          isActive={statusFilter === 'Lost'}
          onClick={() => onStatusClick('Lost')}
        />
      </div>
      <div className="absolute" style={{ left: poloiX, top: dropEndY, transform: 'translateX(-50%)' }}>
        <JourneyBox
          icon="📭"
          label="No Response"
          count={journey.noResponseCount}
          total={journey.validCount}
          tone="gray"
          isActive={statusFilter === 'No Response'}
          onClick={() => onStatusClick('No Response')}
        />
      </div>
    </div>
  )
}

// The Lead Journey — a cumulative funnel (see computeJourney above), same collapsible-card shape
// as EnterpriseRepLeaderboard's "Performance of Lead Owner" (collapsed by default, a button toggles
// it open). Reads `rows` as handed to it (the panel passes `periodRows`, already scoped by the
// Period filter), so picking e.g. "Yesterday" recomputes the whole funnel for just that day.
//
// Only Valid/Invalid/Lost/Not-Contacted are clickable (each is an exact CurrentStage/LeadQuality
// match, so `onStatusClick` toggles a real, meaningful filter) — the funnel-chain boxes are
// deliberately NOT clickable: their number is a cumulative "reached this or further" count, which
// doesn't correspond to any single CurrentStage value a click could filter to (clicking "Future
// Lead" filtering to exactly CurrentStage==='Future Lead' would show far fewer rows than the number
// on the box itself, which is confusing rather than useful).
export default function EnterpriseLeadJourney({ rows, active, onToggle, statusFilter, onStatusClick }) {
  const journey = active ? computeJourney(rows) : null
  // `innerRef` wraps both the row and FunnelExits and is itself the thing that scrolls
  // horizontally — measuring against it (rather than the outer overflow-x-auto viewport) keeps
  // the computed coordinates valid regardless of scroll position, since everything moves together.
  const innerRef = useRef(null)
  const rowRef = useRef(null)
  const stageRefs = useRef({})
  const [exitGeo, setExitGeo] = useState(null)

  useLayoutEffect(() => {
    function measure() {
      const inner = innerRef.current
      const row = rowRef.current
      const antEl = stageRefs.current['Anticipating Demo']
      const poloiEl = stageRefs.current['PO/LOI']
      if (!inner || !row || !antEl || !poloiEl) {
        setExitGeo(null)
        return
      }
      const c = inner.getBoundingClientRect()
      const ant = antEl.getBoundingClientRect()
      const poloi = poloiEl.getBoundingClientRect()
      // The row's own bottom (row.getBoundingClientRect().bottom) is set by its TALLEST child —
      // the Total/Valid/Invalid cluster, which is much taller than a single-row stage box — so it
      // landed the bracket far below the actual chain, leaving a dead gap. Anchor to the stage
      // boxes' own bottom edge instead.
      setExitGeo({
        top: Math.max(ant.bottom, poloi.bottom) - c.top + 6,
        antX: ant.left + ant.width / 2 - c.left,
        poloiX: poloi.left + poloi.width / 2 - c.left,
      })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
    // `journey` is a fresh object literal every render (computeJourney isn't memoized) — depending
    // on it directly would re-run this effect (and its setState) every render, forever. `active`
    // and `rows` are the only things that actually need to retrigger a re-measure.
  }, [active, rows])

  return (
    <div className="rounded-xl border border-border bg-surface p-4 mb-5">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
        <span className="text-[13px] font-semibold text-text flex items-center gap-1.5">🧭 Lead Journey</span>
        <button
          type="button"
          onClick={onToggle}
          className={`text-[11.5px] font-medium rounded-md px-3 py-1.5 border ${active ? 'bg-primary text-white border-primary' : 'border-border text-text-muted'}`}
        >
          {active ? 'Hide lead journey' : 'Click here to see lead journey'}
        </button>
      </div>

      {journey && (
        <div className="mt-3 overflow-x-auto">
          <div ref={innerRef} className="relative min-w-max" style={{ paddingBottom: exitGeo ? 205 : 8 }}>
            <div ref={rowRef} className="flex items-start gap-2">
              <TotalSplit journey={journey} statusFilter={statusFilter} onStatusClick={onStatusClick} />

              <Arrow alignToValidRow />

              <div className="flex items-start gap-2">
                {journey.funnelCounts.map((f, i) => (
                  <div key={f.stage} className="flex items-start gap-2">
                    <div ref={(el) => (stageRefs.current[f.stage] = el)}>
                      <JourneyBox
                        icon={STAGE_ICONS[f.stage] || '📍'}
                        label={f.stage}
                        count={f.count}
                        total={journey.validCount}
                        tone={STAGE_TONES[f.stage] || 'gray'}
                      />
                    </div>
                    {i < journey.funnelCounts.length - 1 && <Arrow />}
                  </div>
                ))}
              </div>
            </div>

            <FunnelExits journey={journey} geo={exitGeo} statusFilter={statusFilter} onStatusClick={onStatusClick} />
          </div>
        </div>
      )}
    </div>
  )
}

const STAGE_ICONS = {
  'Future Lead': '👤',
  'Anticipating Demo': '📅',
  'Trials In Progress': '🧪',
  'Demo Done': '🖥',
  'Quotation Sent': '📄',
  Negotiation: '🤝',
  'PO/LOI': '📝',
  Won: '🏆',
}

const STAGE_TONES = {
  'Future Lead': 'gray',
  'Anticipating Demo': 'amber',
  'Trials In Progress': 'blue',
  'Demo Done': 'amber',
  'Quotation Sent': 'gray',
  Negotiation: 'gray',
  'PO/LOI': 'amber',
  Won: 'green',
}
