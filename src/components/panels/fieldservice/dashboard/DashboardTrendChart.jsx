import { useMemo } from 'react'
import { CategoryScale, Chart as ChartJS, Filler, LinearScale, LineElement, PointElement, Tooltip } from 'chart.js'
import { Line } from 'react-chartjs-2'
import ChartDataLabels from 'chartjs-plugin-datalabels'
import { useChartTheme } from '../../../../hooks/useChartTheme'
import { groupSum } from '../../../../lib/fieldServiceDashboard'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip)

// Ported from old-portal/js/fieldservice-dashboard.js's _fsdRenderCharts' Trend section. Built
// from the active-range-scoped summary rows (unlike 3 of the 4 KPI tiles). ChartDataLabels is
// attached to just this chart instance (`plugins` prop), never globally registered via
// ChartJS.register — production's own comment explains why: doing so would silently turn on
// default labels for every OTHER chart in the app that never guards against it.
export default function DashboardTrendChart({ rows }) {
  const { tickColor } = useChartTheme()

  const { dates, values, max } = useMemo(() => {
    const byDate = groupSum(rows, 'entry_date')
    const ds = [...byDate.keys()].sort()
    const vs = ds.map((d) => byDate.get(d))
    return { dates: ds, values: vs, max: Math.max(0, ...vs) }
  }, [rows])

  const data = {
    labels: dates,
    datasets: [{ label: 'Jobs Done', data: values, borderColor: '#00d4aa', backgroundColor: 'rgba(0,212,170,0.12)', fill: true, tension: 0.3 }],
  }

  const options = {
    // layout.padding.top reserves canvas-level space above the plot area so a label sitting
    // above the highest point isn't clipped by the canvas edge; suggestedMax adds scale headroom
    // so the highest point isn't drawn flush against the top gridline. Both are needed — one
    // fixes the canvas boundary, the other fixes the data range. padding.bottom (new) gives the
    // rotated x-axis date labels reliable breathing room below the plot area, beyond whatever
    // Chart.js's own auto-computed tick-label space provides — paired with a matching height
    // reduction below (242→234) so the card's total height doesn't change at all, just how that
    // same 242px is split between plot area and label margin.
    layout: { padding: { top: 16, bottom: 8 } },
    plugins: {
      legend: { display: false },
      datalabels: { align: 'top', anchor: 'end', color: tickColor, font: { family: 'DM Sans', size: 8 }, backgroundColor: null, padding: 2 },
    },
    scales: {
      x: { ticks: { color: tickColor, font: { family: 'DM Sans', size: 10 }, autoSkip: true, maxRotation: 45 }, grid: { display: false } },
      y: { ticks: { color: tickColor, font: { family: 'DM Sans', size: 10 } }, grid: { display: false }, beginAtZero: true, suggestedMax: max > 0 ? Math.ceil(max * 1.15) : undefined },
    },
    responsive: true,
    maintainAspectRatio: false,
  }

  return (
    <div className="rounded-xl border border-border bg-surface px-3.5 py-2.5">
      <div className="text-[13px] font-semibold text-text mb-1.5">Jobs Done — Trend</div>
      <div style={{ height: 234 }}>
        <Line data={data} options={options} plugins={[ChartDataLabels]} />
      </div>
    </div>
  )
}
