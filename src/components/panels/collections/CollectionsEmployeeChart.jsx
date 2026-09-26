import { useMemo } from 'react'
import { BarElement, CategoryScale, Chart as ChartJS, LinearScale, Tooltip } from 'chart.js'
import { Bar } from 'react-chartjs-2'
import ChartDataLabels from 'chartjs-plugin-datalabels'
import { useChartTheme } from '../../../hooks/useChartTheme'
import { formatLakh, groupSumBy } from '../../../lib/collectionsDashboard'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip)

// Employee leaderboard, ranked by grand total (collections + repeat orders + new business),
// highest first — same click-to-filter convention as Field Service Dashboard's engineer chart.
export default function CollectionsEmployeeChart({ rows, filters, onChange }) {
  const { tickColor } = useChartTheme()

  const { labels, values, max } = useMemo(() => {
    const byOutstanding = groupSumBy(rows, 'name', 'outstanding')
    const byResale = groupSumBy(rows, 'name', 'resale')
    const names = [...new Set(rows.map((r) => r.name).filter(Boolean))]
    const totals = new Map(names.map((n) => [n, (byOutstanding.get(n) || 0) + (byResale.get(n) || 0)]))
    const sorted = [...names].sort((a, b) => totals.get(b) - totals.get(a))
    const vs = sorted.map((n) => totals.get(n))
    return { labels: sorted, values: vs, max: Math.max(0, ...vs) }
  }, [rows])

  const data = { labels, datasets: [{ label: 'Grand Total', data: values, backgroundColor: '#a78bfa', borderRadius: 4, maxBarThickness: 56 }] }

  const options = {
    layout: { padding: { top: 16 } },
    plugins: {
      legend: { display: false },
      tooltip: { bodyFont: { size: 12.5 }, titleFont: { size: 12.5 }, callbacks: { label: (ctx) => formatLakh(ctx.parsed.y) } },
      datalabels: {
        align: 'end',
        anchor: 'end',
        color: tickColor,
        font: { family: 'DM Sans', size: 11 },
        backgroundColor: null,
        padding: 2,
        formatter: (v) => formatLakh(v),
      },
    },
    onClick: (evt, elements) => {
      if (!elements.length) return
      const name = labels[elements[0].index]
      if (name) onChange({ name: filters.name === name ? '' : name })
    },
    scales: {
      x: { ticks: { color: tickColor, font: { family: 'DM Sans', size: 11.5 }, maxRotation: 45, autoSkip: true }, grid: { display: false } },
      y: { ticks: { color: tickColor, font: { family: 'DM Sans', size: 11.5 }, callback: (v) => formatLakh(v) }, grid: { display: false }, beginAtZero: true, suggestedMax: max > 0 ? Math.ceil(max * 1.15) : undefined },
    },
    responsive: true,
    maintainAspectRatio: false,
  }

  return (
    <div className="rounded-xl border border-border bg-surface px-3.5 py-2.5">
      <div className="text-[14.5px] font-semibold text-text mb-1.5">By Employee</div>
      <div style={{ height: 240 }}>
        <Bar data={data} options={options} plugins={[ChartDataLabels]} />
      </div>
    </div>
  )
}
