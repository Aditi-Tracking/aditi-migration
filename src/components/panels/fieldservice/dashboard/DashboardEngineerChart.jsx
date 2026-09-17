import { useMemo } from 'react'
import { BarElement, CategoryScale, Chart as ChartJS, LinearScale, Tooltip } from 'chart.js'
import { Bar } from 'react-chartjs-2'
import ChartDataLabels from 'chartjs-plugin-datalabels'
import { useChartTheme } from '../../../../hooks/useChartTheme'
import { engineerName } from '../../../../lib/fieldService'
import { groupSum } from '../../../../lib/fieldServiceDashboard'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip)

// Ported from old-portal/js/fieldservice-dashboard.js's _fsdRenderCharts' "By engineer" section —
// view_all only, same UI decision as canViewAllFieldService() elsewhere. Standard vertical bar,
// engineer names on x-axis (resolved via Phase 1's cached engineerName()).
export default function DashboardEngineerChart({ rows }) {
  const { tickColor } = useChartTheme()

  const { labels, values, max } = useMemo(() => {
    const byEng = groupSum(rows, 'engineer_id')
    const ids = [...byEng.keys()].sort((a, b) => byEng.get(b) - byEng.get(a))
    const vs = ids.map((id) => byEng.get(id))
    return { labels: ids.map((id) => engineerName(id)), values: vs, max: Math.max(0, ...vs) }
  }, [rows])

  const data = { labels, datasets: [{ label: 'Jobs Done', data: values, backgroundColor: '#3b82f6', borderRadius: 4 }] }

  const options = {
    layout: { padding: { top: 16 } },
    plugins: {
      legend: { display: false },
      datalabels: { align: 'end', anchor: 'end', color: tickColor, font: { family: 'DM Sans', size: 8 }, backgroundColor: null, padding: 2 },
    },
    scales: {
      x: { ticks: { color: tickColor, font: { family: 'DM Sans', size: 9 }, maxRotation: 45, minRotation: 0, autoSkip: true }, grid: { display: false } },
      y: { ticks: { color: tickColor, font: { family: 'DM Sans', size: 10 } }, grid: { display: false }, beginAtZero: true, suggestedMax: max > 0 ? Math.ceil(max * 1.15) : undefined },
    },
    responsive: true,
    maintainAspectRatio: false,
  }

  return (
    <div className="rounded-xl border border-border bg-surface px-3.5 py-2.5">
      <div className="text-[13px] font-semibold text-text mb-1.5">Top Engineers</div>
      <div style={{ height: 198 }}>
        <Bar data={data} options={options} plugins={[ChartDataLabels]} />
      </div>
    </div>
  )
}
