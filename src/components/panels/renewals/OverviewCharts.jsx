import { ArcElement, BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, Tooltip } from 'chart.js'
import { Bar, Doughnut } from 'react-chartjs-2'
import { useChartTheme } from '../../../hooks/useChartTheme'
import { RU_CATEGORY_COLORS, RU_CATEGORY_ORDER, formatIndianCompact } from '../../../lib/renewals'

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend)

// Ported from old-portal/js/renewals.js's _ruBuildOverviewCharts. Category
// Breakdown skips production's on-slice percentage label
// (chartjs-plugin-datalabels, not a dependency of this project — no other
// doughnut here uses it either) — the legend already carries the amount per
// category, so the information isn't lost, just not duplicated on the slice.
export default function OverviewCharts({ financial, coverage }) {
  const { tickColor } = useChartTheme()
  const font = { size: 10 }

  const trend = financial?.monthly_recovery_trend || []
  const byCategory = financial?.outstanding_by_category || {}
  const categories = RU_CATEGORY_ORDER.map((name) => ({ name, total: Number(byCategory[name]?.total || 0) }))

  const total = Number(coverage?.total_customers || 0)
  const called = Number(coverage?.called_this_month || 0)
  const notCalled = Math.max(0, total - called)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
      <ChartCard title="Monthly Received Trend">
        <Bar
          data={{
            labels: trend.map((m) => m.month),
            datasets: [
              {
                label: 'Received',
                data: trend.map((m) => Number(m.recovered)),
                backgroundColor: '#00d4aa',
                borderRadius: 6,
                borderWidth: 0,
                barPercentage: 0.6,
                categoryPercentage: 0.7,
              },
            ],
          }}
          options={{
            plugins: { legend: { display: false } },
            scales: {
              x: { ticks: { color: tickColor, font, autoSkip: true, maxRotation: 0 }, grid: { display: false } },
              y: {
                ticks: { color: tickColor, font, maxTicksLimit: 5, callback: (value) => formatIndianCompact(value) },
                grid: { display: false },
                beginAtZero: true,
              },
            },
            responsive: true,
            maintainAspectRatio: false,
          }}
        />
      </ChartCard>

      <ChartCard title="Category Breakdown">
        <Doughnut
          data={{
            labels: categories.map((c) => `${c.name} (${formatIndianCompact(c.total)})`),
            datasets: [
              {
                data: categories.map((c) => c.total),
                backgroundColor: categories.map((c) => RU_CATEGORY_COLORS[c.name]),
                borderWidth: 0,
                hoverOffset: 8,
              },
            ],
          }}
          options={{
            cutout: '65%',
            plugins: { legend: { position: 'right', labels: { color: tickColor, padding: 10, font } } },
            responsive: true,
            maintainAspectRatio: false,
          }}
        />
      </ChartCard>

      <ChartCard title="Customer Call Coverage">
        <Doughnut
          data={{
            labels: [`Called This Month (${called})`, `Not Called Yet (${notCalled})`],
            datasets: [{ data: [called, notCalled], backgroundColor: ['#00d4aa', '#6b7280'], borderWidth: 0, hoverOffset: 8 }],
          }}
          options={{
            cutout: '65%',
            plugins: { legend: { position: 'right', labels: { color: tickColor, padding: 10, font } } },
            responsive: true,
            maintainAspectRatio: false,
          }}
        />
      </ChartCard>
    </div>
  )
}

function ChartCard({ title, children }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <div className="text-[11.5px] font-semibold text-text-muted mb-2">{title}</div>
      <div className="h-[165px]">{children}</div>
    </div>
  )
}
