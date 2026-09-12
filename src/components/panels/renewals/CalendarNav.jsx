import { RU_CALENDAR_DAYS_OPTIONS } from '../../../lib/renewals'

function fmt(d) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
}

// Ported from old-portal/js/renewals.js's _ruCalendarNavHtml.
export default function CalendarNav({ start, end, workingDays, loading, atToday, onPrev, onNext, onChangeDays }) {
  const nextDisabled = atToday || loading
  return (
    <div className="flex items-center gap-2.5 flex-wrap">
      <button
        type="button"
        onClick={onPrev}
        disabled={loading}
        className="rounded-lg border border-border bg-surface-2 text-text-muted px-3 py-1.5 text-[12px] font-bold disabled:opacity-50 disabled:cursor-not-allowed"
      >
        ◀ Previous {workingDays} working days
      </button>
      <span className="text-[12px] text-text-muted font-semibold whitespace-nowrap">
        {fmt(start)} – {fmt(end)}
      </span>
      <button
        type="button"
        onClick={onNext}
        disabled={nextDisabled}
        className="rounded-lg border border-border bg-surface-2 text-text-muted px-3 py-1.5 text-[12px] font-bold disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Next {workingDays} working days ▶
      </button>
      <select
        value={workingDays}
        onChange={(e) => onChangeDays(e.target.value)}
        disabled={loading}
        title="Working days shown per page"
        className="rounded-lg border border-border bg-surface-2 text-text-muted px-2.5 py-1.5 text-[12px] font-bold"
      >
        {RU_CALENDAR_DAYS_OPTIONS.map((n) => (
          <option key={n} value={n}>
            {n} days
          </option>
        ))}
      </select>
    </div>
  )
}
