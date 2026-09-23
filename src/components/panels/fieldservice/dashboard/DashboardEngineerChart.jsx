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
export default function DashboardEngineerChart({ rows, engineerOptions, loading, onChange }) {
  const { tickColor } = useChartTheme()

  // `engineerOptions` isn't read directly below — engineerName() itself reads the module-level
  // cache in lib/fieldService.js — but it must stay a dependency here so this memo recomputes
  // once fetchEngineerOptions() resolves after this component's first render (e.g. the very
  // first time the Dashboard tab is opened in a session, before any tab has warmed the cache).
  // Without it, `rows` alone doesn't change when the cache fills in, so labels stay pinned to
  // whatever engineerName() resolved (raw uids) on that first, early computation.
  const { labels, values, max, ids } = useMemo(() => {
    const byEng = groupSum(rows, 'engineer_id')
    const ids = [...byEng.keys()].sort((a, b) => byEng.get(b) - byEng.get(a))
    const vs = ids.map((id) => byEng.get(id))
    return { labels: ids.map((id) => engineerName(id)), values: vs, max: Math.max(0, ...vs), ids }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- engineerOptions isn't read in the body above (engineerName() reads the module cache directly), it's a deliberate recompute trigger for when fetchEngineerOptions() resolves after the first render
  }, [rows, engineerOptions])

  const data = { labels, datasets: [{ label: 'Jobs Done', data: values, backgroundColor: '#3b82f6', borderRadius: 4 }] }

  const options = {
    layout: { padding: { top: 16 } },
    plugins: {
      legend: { display: false },
      datalabels: { align: 'end', anchor: 'end', color: tickColor, font: { family: 'DM Sans', size: 8 }, backgroundColor: null, padding: 2 },
    },
    onClick: (evt, elements) => {
      if (!elements.length) return
      const id = ids[elements[0].index]
      if (id) onChange({ engineerId: id })
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
        {loading ? (
          <div className="h-full flex items-center justify-center text-text-muted text-[13px]">⏳ Loading engineer names…</div>
        ) : (
          <Bar data={data} options={options} plugins={[ChartDataLabels]} />
        )}
      </div>
    </div>
  )
}
