import { useMemo } from 'react'
import { ArcElement, BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, Tooltip } from 'chart.js'
import { Bar, Doughnut } from 'react-chartjs-2'
import { useChartTheme } from '../../../hooks/useChartTheme'
import { CHART_BLUES } from '../../../lib/smartFleet'
import { isDone } from '../../../lib/taskChecklist'

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend)

const PRIMARY = '#2563EB'

// Ported from old-portal/js/tasks.js's tRenderCharts (status donut + person
// bar + dept bar — the leaderboard lives in TaskLeaderboard.jsx). `data` is
// already the KPI/chart/status-filtered set (see TaskChecklistPanel).
export default function TaskCharts({ data, activePerson, activeDept, activeStatus, onChartFilter }) {
  const { tickColor, gridColor, dimColor } = useChartTheme()
  const tickOpts = { color: tickColor, font: { family: 'Inter', size: 10 } }
  const gridOpts = { color: gridColor }

  const statusCounts = useMemo(() => {
    const done = data.filter(isDone).length
    return { done, pending: data.length - done }
  }, [data])

  const personCounts = useMemo(() => {
    const map = data.reduce((acc, r) => {
      const n = r.name || ''
      acc[n] = (acc[n] || 0) + 1
      return acc
    }, {})
    return Object.keys(map)
      .sort()
      .map((name) => [name, map[name]])
  }, [data])

  const deptCounts = useMemo(() => {
    const map = data.reduce((acc, r) => {
      const d = r.department || ''
      if (d) acc[d] = (acc[d] || 0) + 1
      return acc
    }, {})
    return Object.keys(map)
      .sort()
      .map((name) => [name, map[name]])
  }, [data])

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
      <ChartCard title="Task Status">
        <Doughnut
          data={{
            labels: ['Completed', 'Pending'],
            datasets: [
              {
                data: [statusCounts.done, statusCounts.pending],
                backgroundColor: [
                  activeStatus && activeStatus !== 'done' ? dimColor : PRIMARY,
                  activeStatus && activeStatus !== 'pending' ? dimColor : '#93C5FD',
                ],
                borderWidth: 0,
                hoverOffset: 8,
              },
            ],
          }}
          options={{
            cutout: '62%',
            responsive: true,
            maintainAspectRatio: false,
            onClick: (_, els) => {
              if (els.length) onChartFilter('status', ['done', 'pending'][els[0].index])
            },
            plugins: { legend: { labels: { color: tickColor, padding: 14, font: { size: 11 } } } },
          }}
        />
      </ChartCard>

      <ChartCard title="Task Count by Person">
        <Bar
          data={{
            labels: personCounts.map(([k]) => k),
            datasets: [
              {
                data: personCounts.map(([, v]) => v),
                backgroundColor: personCounts.map(([k]) => (activePerson && activePerson !== k ? dimColor : PRIMARY)),
                borderRadius: 6,
              },
            ],
          }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            onClick: (_, els) => {
              if (els.length) onChartFilter('person', personCounts[els[0].index][0])
            },
            plugins: { legend: { display: false } },
            scales: { x: { ticks: { ...tickOpts, font: { size: 9 } }, grid: { display: false } }, y: { ticks: tickOpts, grid: gridOpts, beginAtZero: true } },
          }}
        />
      </ChartCard>

      <ChartCard title="Department-wise">
        <Bar
          data={{
            labels: deptCounts.map(([k]) => k),
            datasets: [
              {
                data: deptCounts.map(([, v]) => v),
                backgroundColor: deptCounts.map(([k], i) => (activeDept && activeDept !== k ? dimColor : CHART_BLUES[i % CHART_BLUES.length])),
                borderRadius: 6,
              },
            ],
          }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            onClick: (_, els) => {
              if (els.length) onChartFilter('dept', deptCounts[els[0].index][0])
            },
            plugins: { legend: { display: false } },
            scales: { x: { ticks: { ...tickOpts, font: { size: 9 } }, grid: { display: false } }, y: { ticks: tickOpts, grid: gridOpts, beginAtZero: true } },
          }}
        />
      </ChartCard>
    </div>
  )
}

function ChartCard({ title, children }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3.5">
      <div className="text-[11.5px] font-semibold text-text-muted mb-2 flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-primary" />
        {title}
        <span className="text-[10px] text-text-muted font-normal ml-1">Click to filter</span>
      </div>
      <div className="h-[220px]">{children}</div>
    </div>
  )
}
