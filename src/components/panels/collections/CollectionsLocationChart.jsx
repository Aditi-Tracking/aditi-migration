import { useMemo } from 'react'
import { BarElement, CategoryScale, Chart as ChartJS, LinearScale, Tooltip } from 'chart.js'
import { Bar } from 'react-chartjs-2'
import { useChartTheme } from '../../../hooks/useChartTheme'
import { formatLakh, groupSumBy, uniqueSorted } from '../../../lib/collectionsDashboard'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip)

// Grouped bar (Collections vs Repeat Orders) per branch/location — click a bar to cross-filter,
// same click-to-filter convention as Field Service Dashboard's engineer/job-type charts.
export default function CollectionsLocationChart({ rows, filters, onChange }) {
  const { tickColor, gridColor } = useChartTheme()

  const { labels, outstanding, resale } = useMemo(() => {
    const locs = uniqueSorted(rows, 'location')
    const byOutstanding = groupSumBy(rows, 'location', 'outstanding')
    const byResale = groupSumBy(rows, 'location', 'resale')
    return { labels: locs, outstanding: locs.map((l) => byOutstanding.get(l) || 0), resale: locs.map((l) => byResale.get(l) || 0) }
  }, [rows])

  const data = {
    labels,
    datasets: [
      { label: 'Outstanding', data: outstanding, backgroundColor: '#00d4aa', borderRadius: 4, maxBarThickness: 44 },
      { label: 'Repeat Orders', data: resale, backgroundColor: '#3b82f6', borderRadius: 4, maxBarThickness: 44 },
    ],
  }

  const options = {
    plugins: {
      legend: { position: 'top', labels: { color: tickColor, boxWidth: 10, font: { family: 'DM Sans', size: 12.5 } } },
      tooltip: { bodyFont: { size: 12.5 }, titleFont: { size: 12.5 }, callbacks: { label: (ctx) => `${ctx.dataset.label}: ${formatLakh(ctx.parsed.y)}` } },
    },
    onClick: (evt, elements) => {
      if (!elements.length) return
      const loc = labels[elements[0].index]
      if (loc) onChange({ location: filters.location === loc ? '' : loc })
    },
    scales: {
      x: { ticks: { color: tickColor, font: { family: 'DM Sans', size: 11.5 }, maxRotation: 45, autoSkip: true }, grid: { display: false } },
      y: { ticks: { color: tickColor, font: { family: 'DM Sans', size: 11.5 }, callback: (v) => formatLakh(v) }, grid: { color: gridColor }, beginAtZero: true },
    },
    responsive: true,
    maintainAspectRatio: false,
  }

  return (
    <div className="rounded-xl border border-border bg-surface px-3.5 py-2.5">
      <div className="text-[14.5px] font-semibold text-text mb-1.5">By Location</div>
      <div style={{ height: 240 }}>
        <Bar data={data} options={options} />
      </div>
    </div>
  )
}
