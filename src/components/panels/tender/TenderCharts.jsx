import { Bar, Line } from 'react-chartjs-2'
import { BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, LineElement, PointElement, Tooltip } from 'chart.js'
import { useChartTheme } from '../../../hooks/useChartTheme'

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Tooltip, Legend)

function ChartCard({ title, children }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3.5">
      <div className="text-[11.5px] font-semibold text-text-muted mb-2 flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-primary" />
        {title}
      </div>
      <div className="h-[240px]">{children}</div>
    </div>
  )
}

// Two charts visualizing the Month-wise Summary table directly above them — a stacked status
// breakdown (what happened each month) and a plain volume trend (how much came in each month).
export default function TenderCharts({ monthSummary }) {
  const { tickColor, gridColor } = useChartTheme()
  const tickOpts = { color: tickColor, font: { family: 'Inter', size: 10 } }
  const gridOpts = { color: gridColor }
  const legendOpts = { position: 'top', labels: { color: tickColor, boxWidth: 10, padding: 12, font: { family: 'Inter', size: 10 } } }

  const labels = monthSummary.rows.map((m) => m.month)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
      <ChartCard title="Month-wise Status Breakdown">
        <Bar
          data={{
            labels,
            datasets: [
              { label: 'Submitted', data: monthSummary.rows.map((m) => m.submitted), backgroundColor: '#16A34A', borderRadius: 4 },
              { label: 'Pipeline', data: monthSummary.rows.map((m) => m.pipeline), backgroundColor: '#F0A500', borderRadius: 4 },
              { label: 'Not Submitted', data: monthSummary.rows.map((m) => m.notSubmitted), backgroundColor: '#DC2626', borderRadius: 4 },
            ],
          }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: legendOpts },
            scales: {
              x: { stacked: true, ticks: tickOpts, grid: { display: false } },
              y: { stacked: true, ticks: tickOpts, grid: gridOpts, beginAtZero: true },
            },
          }}
        />
      </ChartCard>

      <ChartCard title="Total Tenders Trend">
        <Line
          data={{
            labels,
            datasets: [
              {
                label: 'Total Tenders',
                data: monthSummary.rows.map((m) => m.total),
                borderColor: '#2563EB',
                backgroundColor: 'rgba(37,99,235,0.1)',
                fill: true,
                tension: 0.35,
                pointBackgroundColor: '#2563EB',
                pointRadius: 4,
                borderWidth: 2,
              },
            ],
          }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { x: { ticks: tickOpts, grid: { display: false } }, y: { ticks: tickOpts, grid: gridOpts, beginAtZero: true } },
          }}
        />
      </ChartCard>
    </div>
  )
}
