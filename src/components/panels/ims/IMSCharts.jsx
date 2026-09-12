import { useMemo } from 'react'
import { ArcElement, BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, Tooltip } from 'chart.js'
import { Bar, Doughnut } from 'react-chartjs-2'
import { useChartTheme } from '../../../hooks/useChartTheme'
import { statusForRow, stockForRow, topStockItems } from '../../../lib/ims'

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend)

const STATUS_COLOR = { zero: 'rgba(255,92,124,0.78)', low: 'rgba(240,165,0,0.78)', ok: 'rgba(0,212,170,0.68)' }

// Ported from old-portal/js/ims.js's _imsRenderCharts/_imsRenderChartsFiltered — a single
// `rows` prop already scoped by the shared filter (see the button/chart-sync fix in
// IMSPanel.jsx), rather than production's two separate code paths for the unfiltered-initial-load
// vs KPI-click-filtered render.
export default function IMSCharts({ rows, effIdx, dateLabel }) {
  const { tickColor, gridColor } = useChartTheme()
  const tickOpts = { color: tickColor, font: { size: 10 } }
  const gridOpts = { color: gridColor }

  const topItems = useMemo(() => topStockItems(rows, effIdx, 15), [rows, effIdx])
  const barLabels = topItems.map((r) => (r.itemName.length > 18 ? r.itemName.slice(0, 16) + '…' : r.itemName))
  const barData = topItems.map((r) => stockForRow(r, effIdx))
  const barColors = topItems.map((r) => STATUS_COLOR[statusForRow(r, effIdx)])

  const zeroCount = rows.filter((r) => statusForRow(r, effIdx) === 'zero').length
  const lowCount = rows.filter((r) => statusForRow(r, effIdx) === 'low').length
  const okCount = rows.filter((r) => statusForRow(r, effIdx) === 'ok').length

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-3.5 mb-5">
      <div className="rounded-2xl border border-border bg-surface p-4">
        <div className="text-[13px] font-semibold text-text mb-3 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-primary" />
          Stock by Item — <span className="text-primary text-[12px]">{dateLabel}</span>
        </div>
        <div className="h-[220px]">
          <Bar
            data={{ labels: barLabels, datasets: [{ data: barData, backgroundColor: barColors, borderRadius: 4, borderSkipped: false }] }}
            options={{
              indexAxis: 'y',
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => ' ' + ctx.raw + ' units' } } },
              scales: { x: { ticks: tickOpts, grid: gridOpts }, y: { ticks: { ...tickOpts, font: { size: 11 } }, grid: { display: false } } },
            }}
          />
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-4">
        <div className="text-[13px] font-semibold text-text mb-3 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#ff5c7c' }} />
          Stock Status
        </div>
        <div className="h-[220px]">
          <Doughnut
            data={{
              labels: ['Zero Stock', 'Low Stock', 'Healthy'],
              datasets: [{ data: [zeroCount, lowCount, okCount], backgroundColor: ['rgba(255,92,124,0.8)', 'rgba(240,165,0,0.8)', 'rgba(0,212,170,0.8)'], borderWidth: 0, hoverOffset: 6 }],
            }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              cutout: '68%',
              plugins: {
                legend: { position: 'bottom', labels: { color: tickColor, padding: 12, font: { size: 11 } } },
                tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${ctx.raw}` } },
              },
            }}
          />
        </div>
      </div>
    </div>
  )
}
