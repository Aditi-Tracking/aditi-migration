import { useMemo } from 'react'
import { ArcElement, BarElement, CategoryScale, Chart as ChartJS, Legend, LineElement, LinearScale, PointElement, Tooltip } from 'chart.js'
import { Bar, Doughnut, Line } from 'react-chartjs-2'
import ChartDataLabels from 'chartjs-plugin-datalabels'
import { useChartTheme } from '../../../hooks/useChartTheme'
import { ENTERPRISE_CATEGORICAL_PALETTE, enterpriseStageColor } from '../../../lib/enterpriseLead'

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, PointElement, LineElement, Tooltip, Legend)

// Ported from old-portal/js/enterprise.js's enRenderCharts. `data` is the cross-filter-scoped set
// (production's D=enGetCF()) for 6 of the 7 charts; `funnel` is computed separately off the FULL
// lead set by the parent and passed here untouched — the Conversion Funnel must never be
// cross-filtered, matching production's own comment on this exactly.
//
// Colors: Lead Status Breakdown/Call Connection Rate/Conversion Funnel keep their real semantic
// colors (Won=green/Lost=red/stage progression — approved). Top Cities/Lead Source Mix/Product
// Interest used an arbitrary 8-color rainbow in production with no per-category meaning — unified
// to ENTERPRISE_CATEGORICAL_PALETTE here, same reasoning as SmartFleet's Source/Team charts
// (approved). Lead Owner Performance was already single-color in production (a plain purple, not a
// rainbow) — kept single-color here too, just using the palette's first entry instead.
export default function EnterpriseCharts({ data, funnel, crossFilter, onChartFilterToggle }) {
  const { tickColor, gridColor, dimColor } = useChartTheme()
  const tickOpts = { color: tickColor, font: { family: 'Inter', size: 10 } }
  const gridOpts = { color: gridColor }
  const legendOpts = { position: 'right', labels: { color: tickColor, padding: 10, font: { family: 'Inter', size: 10 } } }

  const statusBreakdown = useMemo(() => {
    const counts = {}
    data.forEach((r) => {
      const s = r.CurrentStage || 'Not Contacted'
      counts[s] = (counts[s] || 0) + 1
    })
    return Object.keys(counts).map((k) => [k, counts[k]])
  }, [data])

  const dailyLeads = useMemo(() => {
    const counts = {}
    data.forEach((r) => {
      if (r.EntryKey) counts[r.EntryKey] = (counts[r.EntryKey] || 0) + 1
    })
    const keys = Object.keys(counts).sort()
    return { labels: keys.map((d) => d.slice(5)), values: keys.map((d) => counts[d]) }
  }, [data])

  const topCities = useMemo(() => {
    const counts = {}
    data.forEach((r) => {
      const c = r.City || 'Unknown'
      counts[c] = (counts[c] || 0) + 1
    })
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
  }, [data])

  const ownerPerformance = useMemo(() => {
    const counts = {}
    data.forEach((r) => {
      const o = r.Owner || 'Unassigned'
      counts[o] = (counts[o] || 0) + 1
    })
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
  }, [data])

  const sourceMix = useMemo(() => {
    const counts = {}
    data.forEach((r) => {
      const s = r.Source || 'Direct / Unspecified'
      counts[s] = (counts[s] || 0) + 1
    })
    return Object.keys(counts).map((k) => [k, counts[k]])
  }, [data])

  const productInterest = useMemo(() => {
    const counts = {}
    data.forEach((r) => {
      const p = r.Product || 'Unspecified'
      counts[p] = (counts[p] || 0) + 1
    })
    return Object.keys(counts).map((k) => [k, counts[k]])
  }, [data])

  const connectedCount = data.reduce((s, r) => s + r.Connected, 0)
  const noAnswerCount = data.reduce((s, r) => s + (r.CallsMade - r.Connected), 0)

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <ChartCard title="Lead Status Breakdown">
          <Doughnut
            data={{
              labels: statusBreakdown.map(([k]) => k),
              datasets: [
                {
                  data: statusBreakdown.map(([, v]) => v),
                  backgroundColor: statusBreakdown.map(([k]) => (crossFilter.status && crossFilter.status !== k ? dimColor : enterpriseStageColor(k))),
                  borderWidth: 0,
                  hoverOffset: 8,
                },
              ],
            }}
            options={{
              cutout: '68%',
              responsive: true,
              maintainAspectRatio: false,
              onClick: (_, els) => {
                if (els.length) onChartFilterToggle('status', statusBreakdown[els[0].index][0])
              },
              plugins: { legend: legendOpts },
            }}
          />
        </ChartCard>

        <ChartCard title="Daily Leads">
          <Line
            data={{
              labels: dailyLeads.labels,
              datasets: [
                {
                  data: dailyLeads.values,
                  borderColor: '#00d4aa',
                  backgroundColor: 'rgba(0,212,170,0.1)',
                  fill: true,
                  tension: 0.4,
                  pointBackgroundColor: '#00d4aa',
                  pointRadius: 3,
                  borderWidth: 2,
                },
              ],
            }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: { x: { ticks: tickOpts, grid: gridOpts }, y: { ticks: tickOpts, grid: gridOpts } },
            }}
          />
        </ChartCard>

        <ChartCard title="Top Cities">
          <Bar
            data={{
              labels: topCities.map(([k]) => k),
              datasets: [
                {
                  data: topCities.map(([, v]) => v),
                  backgroundColor: topCities.map(([k], i) => (crossFilter.city && crossFilter.city !== k ? dimColor : ENTERPRISE_CATEGORICAL_PALETTE[i % ENTERPRISE_CATEGORICAL_PALETTE.length])),
                  borderRadius: 6,
                },
              ],
            }}
            options={{
              indexAxis: 'y',
              responsive: true,
              maintainAspectRatio: false,
              onClick: (_, els) => {
                if (els.length) onChartFilterToggle('city', topCities[els[0].index][0])
              },
              plugins: { legend: { display: false } },
              scales: { x: { ticks: tickOpts, grid: gridOpts }, y: { ticks: tickOpts, grid: { display: false } } },
            }}
          />
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <ChartCard title="Lead Owner Performance">
          <Bar
            data={{
              labels: ownerPerformance.map(([k]) => k),
              datasets: [
                {
                  data: ownerPerformance.map(([, v]) => v),
                  backgroundColor: ownerPerformance.map(([k]) => (crossFilter.owner && crossFilter.owner !== k ? dimColor : ENTERPRISE_CATEGORICAL_PALETTE[1])),
                  borderRadius: 6,
                },
              ],
            }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              onClick: (_, els) => {
                if (els.length) onChartFilterToggle('owner', ownerPerformance[els[0].index][0])
              },
              plugins: { legend: { display: false } },
              scales: { x: { ticks: { ...tickOpts, font: { family: 'Inter', size: 9 } }, grid: { display: false } }, y: { ticks: tickOpts, grid: gridOpts } },
            }}
          />
        </ChartCard>

        <ChartCard title="Lead Source Mix">
          <Doughnut
            data={{
              labels: sourceMix.map(([k]) => k),
              datasets: [
                {
                  data: sourceMix.map(([, v]) => v),
                  backgroundColor: sourceMix.map(([k], i) => (crossFilter.source && crossFilter.source !== k ? dimColor : ENTERPRISE_CATEGORICAL_PALETTE[i % ENTERPRISE_CATEGORICAL_PALETTE.length])),
                  borderWidth: 0,
                  hoverOffset: 8,
                },
              ],
            }}
            options={{
              cutout: '65%',
              responsive: true,
              maintainAspectRatio: false,
              onClick: (_, els) => {
                if (els.length) onChartFilterToggle('source', sourceMix[els[0].index][0])
              },
              plugins: { legend: legendOpts },
            }}
          />
        </ChartCard>

        <ChartCard title="Call Connection Rate">
          <Doughnut
            data={{ labels: ['Connected', 'No Answer'], datasets: [{ data: [connectedCount, noAnswerCount], backgroundColor: ['#00d4aa', '#ff5c7c'], borderWidth: 0, hoverOffset: 8 }] }}
            options={{ cutout: '68%', responsive: true, maintainAspectRatio: false, plugins: { legend: legendOpts } }}
          />
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Product Interest">
          <Doughnut
            data={{
              labels: productInterest.map(([k]) => k),
              datasets: [
                {
                  data: productInterest.map(([, v]) => v),
                  backgroundColor: productInterest.map(([k], i) => (crossFilter.product && crossFilter.product !== k ? dimColor : ENTERPRISE_CATEGORICAL_PALETTE[i % ENTERPRISE_CATEGORICAL_PALETTE.length])),
                  borderWidth: 0,
                  hoverOffset: 8,
                },
              ],
            }}
            options={{
              cutout: '65%',
              responsive: true,
              maintainAspectRatio: false,
              onClick: (_, els) => {
                if (els.length) onChartFilterToggle('product', productInterest[els[0].index][0])
              },
              plugins: { legend: legendOpts },
            }}
          />
        </ChartCard>

        <ChartCard title="Conversion Funnel">
          <Bar
            plugins={[ChartDataLabels]}
            data={{
              labels: funnel.map((f) => f.label),
              datasets: [{ data: funnel.map((f) => f.value), backgroundColor: funnel.map((f) => f.color), borderRadius: 6 }],
            }}
            options={{
              indexAxis: 'y',
              responsive: true,
              maintainAspectRatio: false,
              layout: { padding: { right: 56 } },
              plugins: {
                legend: { display: false },
                datalabels: {
                  anchor: 'end',
                  align: 'end',
                  color: tickColor,
                  font: { family: 'Inter', size: 10, weight: '600' },
                  formatter: (v) => v.toLocaleString('en-IN') + (funnel[0]?.value ? `  (${((v / funnel[0].value) * 100).toFixed(0)}%)` : ''),
                },
              },
              scales: { x: { ticks: tickOpts, grid: gridOpts }, y: { ticks: tickOpts, grid: { display: false } } },
            }}
          />
        </ChartCard>
      </div>
    </>
  )
}

function ChartCard({ title, children }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3.5">
      <div className="text-[11.5px] font-semibold text-text-muted mb-2 flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-primary" />
        {title}
      </div>
      <div className="h-[220px]">{children}</div>
    </div>
  )
}
