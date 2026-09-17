import { useMemo } from 'react'
import { ArcElement, Chart as ChartJS, Legend, Tooltip } from 'chart.js'
import { Doughnut } from 'react-chartjs-2'
import ChartDataLabels from 'chartjs-plugin-datalabels'
import { useChartTheme } from '../../../../hooks/useChartTheme'
import { JOB_TYPE_CONFIG } from '../../../../lib/fieldService'
import { FSD_CHART_PALETTE, groupSum } from '../../../../lib/fieldServiceDashboard'

// Legend was missing here — this chart's legend only ever rendered because some OTHER already-
// loaded chart file (IMSCharts/SmartFleetCharts/etc.) happened to register Legend globally first
// (Chart.js's registry is one shared singleton across the whole bundle). Registering it explicitly
// here removes that load-order dependency.
ChartJS.register(ArcElement, Legend, Tooltip)

// Ported from old-portal/js/fieldservice-dashboard.js's _fsdRenderCharts' "By job type" section —
// sorted descending by count (display order only, doesn't touch JOB_TYPE_CONFIG itself). Legend
// on the right as "Label (count)"; percentages render on-slice via datalabels (display:'auto'
// hides labels that would overlap/not fit on thin slices) instead of in the legend text. Kept the
// module's own 10-hex categorical palette — this is real per-job-type color encoding, not
// decorative, so it's not unified to the single-primary-blue convention used for KPI tiles/badges
// elsewhere (same reasoning as SmartFleet's Source/Team charts and Renewals' Category Breakdown).
//
// legend.labels' padding/boxWidth are tighter than Chart.js's own defaults — measured: at the
// previous density, JOB_TYPE_CONFIG's full 11 job types don't all fit in one legend column within
// this chart's 198px height, so Chart.js splits the last (smallest) item into its own detached
// mini-column. This density fits all 11 in one aligned column at the same 198px, no height change.
export default function DashboardJobTypeChart({ rows }) {
  const { tickColor } = useChartTheme()

  const { labels, values, colors } = useMemo(() => {
    const byJob = groupSum(rows, 'job_type')
    const keysSorted = [...byJob.keys()].sort((a, b) => byJob.get(b) - byJob.get(a))
    return {
      labels: keysSorted.map((k) => `${(JOB_TYPE_CONFIG[k] && JOB_TYPE_CONFIG[k].label) || k} (${byJob.get(k)})`),
      values: keysSorted.map((k) => byJob.get(k)),
      colors: FSD_CHART_PALETTE.slice(0, keysSorted.length),
    }
  }, [rows])

  const total = values.reduce((s, v) => s + v, 0) || 1
  const data = { labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 0, hoverOffset: 8 }] }

  const options = {
    plugins: {
      legend: { position: 'right', align: 'center', labels: { color: tickColor, font: { family: 'DM Sans', size: 11 }, boxWidth: 10, padding: 5 } },
      datalabels: {
        display: 'auto',
        color: '#fff',
        font: { family: 'DM Sans', size: 10, weight: '700' },
        formatter: (value) => `${Math.round((value / total) * 100)}%`,
      },
    },
    responsive: true,
    maintainAspectRatio: false,
  }

  return (
    <div className="rounded-xl border border-border bg-surface px-3.5 py-2.5">
      <div className="text-[13px] font-semibold text-text mb-1.5">Jobs by Type</div>
      <div style={{ height: 198 }}>
        <Doughnut data={data} options={options} plugins={[ChartDataLabels]} />
      </div>
    </div>
  )
}
