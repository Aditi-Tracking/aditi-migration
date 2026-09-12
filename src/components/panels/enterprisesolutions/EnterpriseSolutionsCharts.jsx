import { useMemo } from 'react'
import { ArcElement, BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, Tooltip } from 'chart.js'
import ChartDataLabels from 'chartjs-plugin-datalabels'
import { Bar, Doughnut } from 'react-chartjs-2'
import { ESOL_COLORS } from '../../../lib/enterpriseSolutions'

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend)

// Horizontal-bar fill: a left->right gradient wash in the given color, or the flat dim color when
// filtered out — dimmed bars stay flat on purpose so only the active/selected bars carry the
// "premium" gradient look. Ported from esolBarFill.
function barFill(ctx, color, dimmed) {
  if (dimmed) return ESOL_COLORS.dim
  const area = ctx.chart.chartArea
  if (!area) return color
  const g = ctx.chart.ctx.createLinearGradient(area.left, 0, area.right, 0)
  g.addColorStop(0, color + '66')
  g.addColorStop(1, color)
  return g
}

// Doughnut center-total — a small Chart.js plugin baked per-instance via closure, ported from
// esolCenterText.
function centerTextPlugin(value, label) {
  return {
    id: 'esolCenterText',
    afterDraw(chart) {
      const { ctx, chartArea } = chart
      if (!chartArea) return
      const cx = chartArea.left + chartArea.width / 2
      const cy = chartArea.top + chartArea.height / 2
      ctx.save()
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = "800 19px 'DM Sans',sans-serif"
      ctx.fillStyle = '#111827'
      ctx.fillText(value, cx, cy - 9)
      ctx.font = "600 9.5px 'DM Sans',sans-serif"
      ctx.fillStyle = '#94a0b8'
      ctx.fillText(label, cx, cy + 10)
      ctx.restore()
    },
  }
}

const barLabelOpt = { anchor: 'end', align: 'end', color: '#334155', font: { size: 10, weight: '600' }, formatter: (v) => v.toLocaleString('en-IN') }
const legendOpt = { position: 'right', labels: { color: ESOL_COLORS.tick, padding: 10, usePointStyle: true, pointStyle: 'circle', font: { size: 10 } } }
const scaleOpt = { x: { ticks: { color: ESOL_COLORS.tick, font: { size: 10 } }, grid: { color: ESOL_COLORS.grid } }, y: { ticks: { color: ESOL_COLORS.tick, font: { size: 10 } }, grid: { display: false } } }

function ChartCard({ title, badgeColor, children }) {
  return (
    <div className="rounded-2xl bg-white border border-[#e9ecf5] shadow-[0_1px_2px_rgba(15,23,42,0.04)] p-4">
      <div className="text-[13px] font-semibold text-[#1e293b] mb-3 flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: badgeColor }} />
        {title}
      </div>
      <div className="h-[220px]">{children}</div>
    </div>
  )
}

// Ported from old-portal/js/entsol.js's esolRenderCharts. Fixed-light chart theming throughout
// (ESOL_COLORS) — NOT useChartTheme(), matching this module's independent-of-dark/light-toggle
// design. CONFIRMED ASYMMETRY, ported as-is: ClickTask's Top-Customers bar has no onClick at all
// (non-interactive), while CoolBus's parallel Schools-by-License bar IS click-to-filter — this
// lines up with ESOLcf.customer being confirmed dead/unwired (see lib/enterpriseSolutions.js).
export default function EnterpriseSolutionsCharts({ tab, data, crossFilter, onChartFilterToggle }) {
  const isCt = tab === 'clicktask'
  const d = isCt ? data.clicktask : data.coolbus

  const topCustomers = useMemo(() => (isCt ? [...(d.customers || [])].sort((a, b) => b.licenseCount - a.licenseCount).slice(0, 10) : []), [isCt, d])
  const schoolsSorted = useMemo(() => (!isCt ? [...(d.schools || [])].sort((a, b) => b.licenseCount - a.licenseCount) : []), [isCt, d])

  const locationCounts = useMemo(() => {
    const rows = isCt ? d.customers || [] : d.schools || []
    const counts = {}
    rows.forEach((r) => {
      const l = r.location || 'Unspecified'
      counts[l] = (counts[l] || 0) + 1
    })
    return Object.entries(counts)
  }, [isCt, d])

  const totalEntities = isCt ? d.totalCustomers || 0 : d.totalSchools || 0
  const totalLicenses = isCt ? d.totalCustomerLicenses || 0 : d.totalSchoolLicenses || 0
  const mixTotal = totalLicenses + (d.totalTrialLicenses || 0)

  if (isCt) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
        <ChartCard title="Top Customers by Licenses" badgeColor="#00d4aa">
          <Bar
            plugins={[ChartDataLabels]}
            data={{ labels: topCustomers.map((r) => r.customer), datasets: [{ data: topCustomers.map((r) => r.licenseCount), backgroundColor: (ctx) => barFill(ctx, '#00d4aa', false), borderRadius: 6, borderWidth: 0, maxBarThickness: 18 }] }}
            options={{ indexAxis: 'y', layout: { padding: { right: 34 } }, responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: ESOL_COLORS.tooltip, datalabels: barLabelOpt }, scales: scaleOpt }}
          />
        </ChartCard>

        <ChartCard title="Customers by Location" badgeColor="#f0a500">
          <Doughnut
            plugins={[centerTextPlugin(totalEntities, 'Customers')]}
            data={{ labels: locationCounts.map(([k]) => k), datasets: [{ data: locationCounts.map(([, v]) => v), backgroundColor: locationCounts.map(([k], i) => (crossFilter.location && crossFilter.location !== k ? ESOL_COLORS.dim : ESOL_COLORS.palette[i % ESOL_COLORS.palette.length])), borderWidth: 2, borderColor: '#fff', hoverOffset: 8 }] }}
            options={{ cutout: '68%', responsive: true, maintainAspectRatio: false, onClick: (_, els) => els.length && onChartFilterToggle('location', locationCounts[els[0].index][0]), plugins: { legend: legendOpt, tooltip: ESOL_COLORS.tooltip } }}
          />
        </ChartCard>

        <ChartCard title="License Mix — Live vs Trial" badgeColor="#a78bfa">
          <Doughnut
            plugins={[centerTextPlugin(mixTotal.toLocaleString('en-IN'), 'Total Licenses')]}
            data={{
              labels: ['Live Licenses', 'Trial Licenses'],
              datasets: [{ data: [totalLicenses, d.totalTrialLicenses || 0], backgroundColor: ['Customer', 'Trial'].map((k) => (crossFilter.type && crossFilter.type !== k ? ESOL_COLORS.dim : k === 'Customer' ? '#00d4aa' : '#a78bfa')), borderWidth: 2, borderColor: '#fff', hoverOffset: 8 }],
            }}
            options={{ cutout: '65%', responsive: true, maintainAspectRatio: false, onClick: (_, els) => els.length && onChartFilterToggle('type', ['Customer', 'Trial'][els[0].index]), plugins: { legend: legendOpt, tooltip: ESOL_COLORS.tooltip } }}
          />
        </ChartCard>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
      <ChartCard title="Schools by Licenses" badgeColor="#4e9af1">
        <Bar
          plugins={[ChartDataLabels]}
          data={{
            labels: schoolsSorted.map((r) => r.school),
            datasets: [{ data: schoolsSorted.map((r) => r.licenseCount), backgroundColor: (ctx) => barFill(ctx, '#4e9af1', crossFilter.school && crossFilter.school !== schoolsSorted[ctx.dataIndex]?.school), borderRadius: 6, borderWidth: 0, maxBarThickness: 18 }],
          }}
          options={{ indexAxis: 'y', layout: { padding: { right: 38 } }, responsive: true, maintainAspectRatio: false, onClick: (_, els) => els.length && onChartFilterToggle('school', schoolsSorted[els[0].index].school), plugins: { legend: { display: false }, tooltip: ESOL_COLORS.tooltip, datalabels: barLabelOpt }, scales: scaleOpt }}
        />
      </ChartCard>

      <ChartCard title="License Share by School" badgeColor="#00d4aa">
        <Doughnut
          plugins={[centerTextPlugin(totalLicenses.toLocaleString('en-IN'), 'Total Licenses')]}
          data={{ labels: schoolsSorted.map((r) => r.school), datasets: [{ data: schoolsSorted.map((r) => r.licenseCount), backgroundColor: schoolsSorted.map((r, i) => (crossFilter.school && crossFilter.school !== r.school ? ESOL_COLORS.dim : ESOL_COLORS.palette[i % ESOL_COLORS.palette.length])), borderWidth: 2, borderColor: '#fff', hoverOffset: 8 }] }}
          options={{ cutout: '62%', responsive: true, maintainAspectRatio: false, onClick: (_, els) => els.length && onChartFilterToggle('school', schoolsSorted[els[0].index].school), plugins: { legend: { position: 'right', labels: { color: ESOL_COLORS.tick, padding: 8, usePointStyle: true, pointStyle: 'circle', font: { size: 9.5 } } }, tooltip: ESOL_COLORS.tooltip } }}
        />
      </ChartCard>

      <ChartCard title="Schools by Location" badgeColor="#f0a500">
        <Doughnut
          plugins={[centerTextPlugin(totalEntities, 'Schools')]}
          data={{ labels: locationCounts.map(([k]) => k), datasets: [{ data: locationCounts.map(([, v]) => v), backgroundColor: locationCounts.map(([k], i) => (crossFilter.location && crossFilter.location !== k ? ESOL_COLORS.dim : ESOL_COLORS.palette[i % ESOL_COLORS.palette.length])), borderWidth: 2, borderColor: '#fff', hoverOffset: 8 }] }}
          options={{ cutout: '68%', responsive: true, maintainAspectRatio: false, onClick: (_, els) => els.length && onChartFilterToggle('location', locationCounts[els[0].index][0]), plugins: { legend: legendOpt, tooltip: ESOL_COLORS.tooltip } }}
        />
      </ChartCard>

      <ChartCard title="License Mix — Live vs Trial" badgeColor="#a78bfa">
        <Doughnut
          plugins={[centerTextPlugin(mixTotal.toLocaleString('en-IN'), 'Total Licenses')]}
          data={{
            labels: ['Live Licenses', 'Trial Licenses'],
            datasets: [{ data: [totalLicenses, d.totalTrialLicenses || 0], backgroundColor: ['Customer', 'Trial'].map((k) => (crossFilter.type && crossFilter.type !== k ? ESOL_COLORS.dim : k === 'Customer' ? '#00d4aa' : '#a78bfa')), borderWidth: 2, borderColor: '#fff', hoverOffset: 8 }],
          }}
          options={{ cutout: '65%', responsive: true, maintainAspectRatio: false, onClick: (_, els) => els.length && onChartFilterToggle('type', ['Customer', 'Trial'][els[0].index]), plugins: { legend: legendOpt, tooltip: ESOL_COLORS.tooltip } }}
        />
      </ChartCard>
    </div>
  )
}
