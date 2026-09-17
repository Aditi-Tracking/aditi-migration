import { useMemo } from 'react'
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js'
import { Bar, Doughnut, Line } from 'react-chartjs-2'
import { useChartTheme } from '../../../hooks/useChartTheme'
import { CHART_BLUES } from '../../../lib/smartFleet'

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, PointElement, LineElement, Tooltip, Legend)

const PRIMARY = '#2563EB'
const PRIMARY_LIGHT = '#93C5FD'
const DANGER = '#DC2626'

function monthLabel(m) {
  const [y, mm] = m.split('-')
  return new Date(+y, +mm - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })
}

function productList(heroProduct) {
  return (heroProduct || '')
    .split(/[,/]/)
    .map((p) => p.trim().replace(/\s+/g, '').toUpperCase())
    .filter(Boolean)
}

// Ported from old-portal/js/leads.js's lRenderCharts. `data` is already
// filtered by kpiFilter + chartFilters (see SmartFleetPanel) — deliberately
// NOT by stageFilter, matching production's D=lGetCF(). Non-matching
// bars/segments dim rather than disappear when a chart filter is active.
// Colors: a blue-shades categorical palette for Source/Team (multi-series),
// single primary/danger for the rest — the single-palette restyling
// applied throughout, not production's arbitrary multi-hue set.
export default function SmartFleetCharts({ data, chartFilters, onChartFilterToggle }) {
  const { tickColor, gridColor, dimColor } = useChartTheme()

  const tickOpts = { color: tickColor, font: { family: 'Inter', size: 10 } }
  const gridOpts = { color: gridColor }

  const trend = useMemo(() => {
    const byMonth = {}
    data.forEach((r) => {
      const m = (r.lead_created_at || '').slice(0, 7)
      if (m.length !== 7) return
      if (!byMonth[m]) byMonth[m] = { total: 0, won: 0 }
      byMonth[m].total++
      if (r.Stage === 'Won') byMonth[m].won++
    })
    const keys = Object.keys(byMonth).sort()
    return {
      labels: keys.map(monthLabel),
      datasets: [
        { label: 'Total Leads', data: keys.map((m) => byMonth[m].total), backgroundColor: PRIMARY_LIGHT, borderRadius: 4 },
        { label: 'Won', data: keys.map((m) => byMonth[m].won), backgroundColor: PRIMARY, borderRadius: 4 },
      ],
    }
  }, [data])

  const sourceBreakdown = useMemo(() => {
    const counts = {}
    data.forEach((r) => {
      const s = r.source_channel || 'Unknown'
      counts[s] = (counts[s] || 0) + 1
    })
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
  }, [data])

  const teamBreakdown = useMemo(() => {
    const counts = {}
    data.forEach((r) => {
      const s = r.team_name || 'Unassigned'
      counts[s] = (counts[s] || 0) + 1
    })
    return Object.entries(counts)
  }, [data])

  const dailyVolume = useMemo(() => {
    const counts = {}
    data.forEach((r) => {
      const d = (r.lead_created_at || '').slice(0, 10)
      if (d.length === 10) counts[d] = (counts[d] || 0) + 1
    })
    const keys = Object.keys(counts).sort()
    return { labels: keys.map((d) => d.slice(5)), values: keys.map((d) => counts[d]) }
  }, [data])

  const productDemand = useMemo(() => {
    const counts = {}
    data
      .filter((r) => r.Stage === 'Won')
      .forEach((r) => productList(r.hero_product).forEach((p) => (counts[p] = (counts[p] || 0) + 1)))
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
  }, [data])

  const lostReasons = useMemo(() => {
    const counts = {}
    data
      .filter((r) => r.Stage === 'Lost')
      .forEach((r) => {
        const k = r.lost_reason_name || 'Unspecified'
        counts[k] = (counts[k] || 0) + 1
      })
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
  }, [data])

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <ChartCard title="Monthly Trend">
          <Bar
            data={trend}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { labels: { color: tickColor, font: { family: 'Inter', size: 10 } } } },
              scales: { x: { ticks: tickOpts, grid: { display: false } }, y: { ticks: tickOpts, grid: gridOpts } },
            }}
          />
        </ChartCard>

        <ChartCard title="Source Breakdown">
          <Bar
            data={{
              labels: sourceBreakdown.map(([k]) => k),
              datasets: [
                {
                  data: sourceBreakdown.map(([, v]) => v),
                  backgroundColor: sourceBreakdown.map(([k], i) =>
                    chartFilters.source && chartFilters.source !== k ? dimColor : CHART_BLUES[i % CHART_BLUES.length]
                  ),
                  borderRadius: 6,
                },
              ],
            }}
            options={{
              indexAxis: 'y',
              responsive: true,
              maintainAspectRatio: false,
              onClick: (_, els) => {
                if (els.length) onChartFilterToggle('source', sourceBreakdown[els[0].index][0])
              },
              plugins: { legend: { display: false } },
              scales: { x: { ticks: tickOpts, grid: gridOpts }, y: { ticks: tickOpts, grid: { display: false } } },
            }}
          />
        </ChartCard>

        <ChartCard title="Team Breakdown">
          <Doughnut
            data={{
              labels: teamBreakdown.map(([k]) => k),
              datasets: [
                {
                  data: teamBreakdown.map(([, v]) => v),
                  backgroundColor: teamBreakdown.map(([k], i) =>
                    chartFilters.team && chartFilters.team !== k ? dimColor : CHART_BLUES[i % CHART_BLUES.length]
                  ),
                  borderWidth: 0,
                  hoverOffset: 8,
                },
              ],
            }}
            options={{
              cutout: '65%',
              responsive: true,
              maintainAspectRatio: false,
              onClick: (_, els) => {
                if (els.length) onChartFilterToggle('team', teamBreakdown[els[0].index][0])
              },
              plugins: { legend: { position: 'right', labels: { color: tickColor, padding: 10, font: { family: 'Inter', size: 10 } } } },
            }}
          />
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartCard title="Daily Lead Volume">
          <Line
            data={{
              labels: dailyVolume.labels,
              datasets: [
                {
                  data: dailyVolume.values,
                  borderColor: PRIMARY,
                  backgroundColor: 'rgba(37,99,235,0.08)',
                  fill: true,
                  tension: 0.4,
                  pointBackgroundColor: PRIMARY,
                  pointRadius: 3,
                  borderWidth: 2,
                },
              ],
            }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: { x: { ticks: tickOpts, grid: gridOpts }, y: { ticks: tickOpts, grid: gridOpts } },
            }}
          />
        </ChartCard>

        <ChartCard title="Hero Product Demand (Won)">
          <Bar
            data={{
              labels: productDemand.map(([k]) => k),
              datasets: [
                {
                  data: productDemand.map(([, v]) => v),
                  backgroundColor: productDemand.map(([k]) => (chartFilters.product && chartFilters.product !== k ? dimColor : PRIMARY)),
                  borderRadius: 6,
                },
              ],
            }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              onClick: (_, els) => {
                if (els.length) onChartFilterToggle('product', productDemand[els[0].index][0])
              },
              plugins: { legend: { display: false } },
              scales: { x: { ticks: { ...tickOpts, font: { family: 'Inter', size: 9 } }, grid: { display: false } }, y: { ticks: tickOpts, grid: gridOpts } },
            }}
          />
        </ChartCard>

        <ChartCard title="Lost Reasons">
          <Bar
            data={{
              labels: lostReasons.map(([k]) => k),
              datasets: [
                {
                  data: lostReasons.map(([, v]) => v),
                  backgroundColor: lostReasons.map(([k]) => (chartFilters.lostReason && chartFilters.lostReason !== k ? dimColor : DANGER)),
                  borderRadius: 6,
                },
              ],
            }}
            options={{
              indexAxis: 'y',
              responsive: true,
              maintainAspectRatio: false,
              onClick: (_, els) => {
                if (els.length) onChartFilterToggle('lostReason', lostReasons[els[0].index][0])
              },
              plugins: { legend: { display: false } },
              scales: { x: { ticks: tickOpts, grid: gridOpts }, y: { ticks: tickOpts, grid: { display: false } } },
            }}
          />
        </ChartCard>
      </div>
    </>
  )
}

function ChartCard({ title, children }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3.5">
      <div className="text-[11.5px] font-semibold text-text-muted mb-2 flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-primary" />
        {title}
      </div>
      <div className="h-[190px]">{children}</div>
    </div>
  )
}
