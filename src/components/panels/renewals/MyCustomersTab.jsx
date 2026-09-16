import { useEffect, useMemo, useState } from 'react'
import {
  RU_CALENDAR_DAYS_OPTIONS,
  RU_COLUMNS,
  calendarDateList,
  calendarDateRange,
  addWorkingDays,
  fetchCalendarCalls,
  fetchCrmPersons,
  fetchLatestCallForCustomer,
  fetchLatestCollectionCalls,
  fetchLatestOutstandingSnapshots,
  fetchMyCustomers,
  filterByAssignedTo,
  filterBySearch,
  filterCallableCustomers,
  groupByCategory,
  isColumnVisible,
  latestWorkingDay,
  loadCalendarDaysPref,
  loadColumnPrefs,
  mergeCustomerRows,
  saveCalendarDaysPref,
  saveColumnPrefs,
  todayStr,
} from '../../../lib/renewals'
import { useScreenshotCache } from '../../../hooks/useScreenshotCache'
import ColumnsMenu from './ColumnsMenu'
import CalendarNav from './CalendarNav'
import MyCustomersTable from './MyCustomersTable'
import CustomerDetailModal from './CustomerDetailModal'
import ScreenshotLightbox from './ScreenshotLightbox'
import NoteActionDialog from './NoteActionDialog'

// Ported from old-portal/js/renewals.js's loadRenewalsMyCustomers/
// ruRenderMyCustomers/ruLoadCalendarCalls. Search is implemented as a real
// filtered React array (idiomatic state) rather than production's DOM-class
// row-hiding — same visible result, different mechanism.
export default function MyCustomersTab({ location, isMIS, fullDataAccess, crmPerson }) {
  const crmPersonId = crmPerson?.id || null

  const [customers, setCustomers] = useState([])
  const [persons, setPersons] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [sortKey, setSortKey] = useState('outstanding')
  const [sortDir, setSortDir] = useState(-1)
  const [assignedToFilter, setAssignedToFilter] = useState('')
  const [search, setSearch] = useState('')
  const [columnPrefs, setColumnPrefs] = useState(loadColumnPrefs())

  const [workingDays, setWorkingDays] = useState(loadCalendarDaysPref())
  const [windowEnd, setWindowEnd] = useState(null) // null = today
  const [callsMap, setCallsMap] = useState(null) // null = not loaded yet
  const [calendarLoading, setCalendarLoading] = useState(false)

  const [detailCustomerId, setDetailCustomerId] = useState(null)
  const [lightbox, setLightbox] = useState(null) // { paths, index } | null
  const screenshotCache = useScreenshotCache()
  const [flagDialogCustomerId, setFlagDialogCustomerId] = useState(null)

  // Fresh load whenever location/scope changes — mirrors loadRenewalsMyCustomers,
  // which resets sort/filter/calendar state on every fresh tab entry too.
  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fresh load triggered by a location/scope change, not a synchronous render loop
    setLoading(true)
    setError('')
    Promise.all([
      fetchMyCustomers({ location, isMIS, fullDataAccess, crmPersonId }),
      fetchLatestOutstandingSnapshots(location),
      fetchLatestCollectionCalls({ location, isMIS, fullDataAccess, crmPersonId }),
      fetchCrmPersons(location),
    ])
      .then(([rawCustomers, snaps, calls, personsRows]) => {
        if (cancelled) return
        setCustomers(mergeCustomerRows(rawCustomers, snaps, calls))
        setPersons(personsRows)
        setSortKey('outstanding')
        setSortDir(-1)
        setAssignedToFilter('')
        setSearch('')
        setWorkingDays(loadCalendarDaysPref())
        setWindowEnd(null)
        setCallsMap(null)
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [location, isMIS, fullDataAccess, crmPersonId])

  const { start, end } = calendarDateRange(windowEnd, workingDays)

  // Keyed on WHICH customers exist, not the array reference — an inline
  // field/status edit or a reassign-removal produces a new `customers`
  // array too, but only a reassign actually changes this key, so a plain
  // city/status edit doesn't trigger a needless calendar refetch.
  const customerIdsKey = useMemo(() => customers.map((c) => c.id).join(','), [customers])

  // Calendar calls refetch whenever the customer set or the visible window
  // changes — scoped to the window only, never the whole history.
  useEffect(() => {
    if (!customerIdsKey) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- no customers to fetch calls for, resolves the map immediately
      setCallsMap(new Map())
      return
    }
    let cancelled = false
    setCalendarLoading(true)
    fetchCalendarCalls({ location, isMIS, fullDataAccess, crmPersonId, start, end })
      .then((rows) => {
        if (cancelled) return
        setCallsMap(new Map(rows.map((r) => [`${r.customer_id}|${r.call_date}`, r])))
      })
      .catch(() => !cancelled && setCallsMap(new Map()))
      .finally(() => !cancelled && setCalendarLoading(false))
    return () => {
      cancelled = true
    }
  }, [customerIdsKey, location, isMIS, fullDataAccess, crmPersonId, start, end])

  function handleSort(key) {
    if (sortKey === key) setSortDir((d) => d * -1)
    else {
      setSortKey(key)
      setSortDir(1)
    }
  }

  function handleCalendarPrev() {
    if (calendarLoading) return
    setWindowEnd(addWorkingDays(start, -1))
  }

  function handleCalendarNext() {
    if (calendarLoading) return
    const latest = latestWorkingDay(todayStr())
    let newEnd = addWorkingDays(end, workingDays)
    if (newEnd > latest) newEnd = latest
    if (newEnd === end) return // already showing the most recent window
    setWindowEnd(newEnd)
  }

  // Changing the day-count keeps the current window's right edge fixed and
  // just widens/narrows how far back it reaches.
  function handleChangeCalendarDays(value) {
    const n = parseInt(value, 10)
    if (!RU_CALENDAR_DAYS_OPTIONS.includes(n) || n === workingDays) return
    setWorkingDays(n)
    saveCalendarDaysPref(n)
  }

  function handleToggleColumn(key, checked) {
    const next = { ...columnPrefs, [key]: checked }
    setColumnPrefs(next)
    saveColumnPrefs(next)
  }

  function afterMutation(customerId, updater) {
    setCustomers((prev) => prev.map((c) => (c.id === customerId ? updater(c) : c)))
  }

  function handleReassigned(customerId) {
    setCustomers((prev) => prev.filter((c) => c.id !== customerId))
  }

  function handleCategorySaved(customerId, category, callingFrequency) {
    afterMutation(customerId, (c) => ({ ...c, category, calling_frequency: callingFrequency }))
  }

  // Ported from ruSaveCall's tail: patches the calendar cell locally (same
  // shape a refetch would return), optimistically bumps recovered_amount
  // (the real value is DB-trigger-derived), then refreshes the Last Call
  // cell via a real refetch — not a local guess.
  function handleCallSaved(customerId, { callDate, connected, amountRecovered }) {
    setCallsMap((prev) => {
      const next = new Map(prev)
      next.set(`${customerId}|${callDate}`, { customer_id: customerId, call_date: callDate, connected })
      return next
    })
    if (amountRecovered) {
      afterMutation(customerId, (c) => ({ ...c, recovered_amount: Number(c.recovered_amount || 0) + amountRecovered }))
    }
    fetchLatestCallForCustomer(customerId)
      .then((lastCall) => afterMutation(customerId, (c) => ({ ...c, _lastCall: lastCall })))
      .catch(() => {})
  }

  function handleCloseDetail() {
    setDetailCustomerId(null)
    screenshotCache.clear()
  }

  function handleOpenLightbox(paths, index) {
    setLightbox({ paths, index })
  }

  // Local-cache update, mirroring the reassign/status-change pattern rather
  // than a full reload — the row's badge flips from "Send to Accounts" to
  // "With Accounts" immediately.
  function handleFlagSubmitted(_mode, customerId) {
    setFlagDialogCustomerId(null)
    afterMutation(customerId, (c) => ({ ...c, accounts_flag_status: 'open' }))
  }

  const dates = calendarDateList(windowEnd, workingDays)
  const columns = RU_COLUMNS.filter((col) => isColumnVisible(columnPrefs, col.key, { isMIS, fullDataAccess }))

  const callableCustomers = useMemo(() => filterCallableCustomers(customers), [customers])
  const assignedFiltered = useMemo(
    () => filterByAssignedTo(callableCustomers, assignedToFilter),
    [callableCustomers, assignedToFilter]
  )
  const visible = useMemo(() => filterBySearch(assignedFiltered, search), [assignedFiltered, search])
  const groups = useMemo(() => groupByCategory(visible, sortKey, sortDir, persons), [visible, sortKey, sortDir, persons])

  const emptyMessage =
    assignedToFilter || search
      ? 'No customers match this filter.'
      : assignedFiltered.length
        ? 'Everyone in this book is paid up — see the Closed/Paid tab.'
        : isMIS || fullDataAccess
          ? 'No customers found.'
          : 'No customers assigned to you yet.'

  const detailCustomer = customers.find((c) => c.id === detailCustomerId) || null

  return (
    <div>
      {/* Rendered unconditionally, matching AccountsTab's pattern — a fresh
          load happens on every tab entry (see the effect above), so gating
          this whole row behind `loading` used to make it pop in from
          nothing every time this tab was (re-)opened, right below the
          stable TabBar/LocationBar. Only the table area below is
          loading/error-gated now, same as AccountsTab gates just its own
          table, not its title/filter row. */}
      <div className="flex items-center justify-between gap-2.5 flex-wrap mb-3.5">
        <div className="flex items-center gap-2.5 flex-wrap">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 Search billing name..."
            className="rounded-lg border border-border bg-surface-2 text-text px-3 py-1.5 text-[12.5px] outline-none"
          />
          <ColumnsMenu columnPrefs={columnPrefs} isMIS={isMIS} fullDataAccess={fullDataAccess} onToggle={handleToggleColumn} />
          {(isMIS || fullDataAccess) && (
            <select
              value={assignedToFilter}
              onChange={(e) => setAssignedToFilter(e.target.value)}
              className="rounded-lg border border-border bg-surface-2 text-text px-3 py-1.5 text-[12.5px] font-bold"
            >
              <option value="">Assigned To: All</option>
              <option value="__unassigned__">— Unassigned —</option>
              {persons.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <CalendarNav
          start={start}
          end={end}
          workingDays={workingDays}
          loading={calendarLoading}
          atToday={end === latestWorkingDay(todayStr())}
          onPrev={handleCalendarPrev}
          onNext={handleCalendarNext}
          onChangeDays={handleChangeCalendarDays}
        />
      </div>

      {loading ? (
        <p className="text-text-muted text-[13.5px]">Loading…</p>
      ) : error ? (
        <p className="text-danger text-[13.5px]">⚠️ {error}</p>
      ) : (
        <MyCustomersTable
          groups={groups}
          dates={dates}
          start={start}
          end={end}
          callsMap={callsMap}
          calendarLoading={calendarLoading}
          crmPerson={crmPerson}
          persons={persons}
          columns={columns}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleSort}
          afterMutation={afterMutation}
          onOpenDetail={setDetailCustomerId}
          onCallSaved={handleCallSaved}
          onOpenFlagDialog={setFlagDialogCustomerId}
          emptyMessage={emptyMessage}
        />
      )}

      <NoteActionDialog
        open={!!flagDialogCustomerId}
        mode="flag"
        customerId={flagDialogCustomerId}
        onClose={() => setFlagDialogCustomerId(null)}
        onSubmitted={handleFlagSubmitted}
      />

      <CustomerDetailModal
        open={!!detailCustomerId}
        customer={detailCustomer}
        persons={persons}
        crmPerson={crmPerson}
        getUrl={screenshotCache.getUrl}
        clearScreenshotCache={screenshotCache.clear}
        onClose={handleCloseDetail}
        onCategorySaved={handleCategorySaved}
        onReassigned={handleReassigned}
        onOpenLightbox={handleOpenLightbox}
      />

      <ScreenshotLightbox
        paths={lightbox?.paths ?? null}
        index={lightbox?.index ?? 0}
        getUrl={screenshotCache.getUrl}
        onIndexChange={(index) => setLightbox((l) => l && { ...l, index })}
        onClose={() => setLightbox(null)}
      />
    </div>
  )
}
