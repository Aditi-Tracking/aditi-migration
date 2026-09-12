import { useEffect, useMemo, useState } from 'react'
import {
  RU_CALENDAR_DAYS_OPTIONS,
  RU_COLUMNS,
  calendarDateList,
  calendarDateRange,
  addWorkingDays,
  fetchCalendarCalls,
  fetchCrmPersons,
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
import ColumnsMenu from './ColumnsMenu'
import CalendarNav from './CalendarNav'
import MyCustomersTable from './MyCustomersTable'

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

  if (loading) return <p className="text-text-muted text-[13.5px]">Loading…</p>
  if (error) return <p className="text-danger text-[13.5px]">⚠️ {error}</p>

  return (
    <div>
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
        onReassigned={handleReassigned}
        afterMutation={afterMutation}
        emptyMessage={emptyMessage}
      />
    </div>
  )
}
