import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../../context/AuthContext'
import {
  calcPendingAmount,
  canCreateOrder,
  canViewAllOrders,
  computeFmsKpiSummary,
  deleteOrder,
  empName,
  fetchEmployeeNameMap,
  fetchFmsLocations,
  fetchFmsOrders,
  fetchFmsProducts,
  fetchSupportPersons,
} from '../../../lib/fms'
import FMSKpiGrid from './FMSKpiGrid'
import FMSFilterBar from './FMSFilterBar'
import FMSPipelineTable from './FMSPipelineTable'
import NewOrderModal from './NewOrderModal'
import UpdatePaymentModal from './UpdatePaymentModal'
import TimelineModal from './TimelineModal'

// Ported from old-portal/js/fms.js's fmsInit/fmsLoadOrders/fmsApplyFilters —
// Phase 1: dashboard, New Order/Edit, Timeline/Notes, Update Payment,
// Delete. The pipeline action overlays (Support/Config/Engineer/Install/
// Certification/Reassign) are Phase 2 — the pipeline table's action column
// stays "View only" until then.
export default function FMSPanel() {
  const { currentUser, permissions } = useAuth()

  const [orders, setOrders] = useState([])
  const [products, setProducts] = useState([])
  const [locations, setLocations] = useState([])
  const [empMap, setEmpMap] = useState({})
  const [supportPersons, setSupportPersons] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [search, setSearch] = useState('')
  const [clientType, setClientType] = useState('')
  const [createdBy, setCreatedBy] = useState('')
  const [locationFilter, setLocationFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [pendingPaymentActive, setPendingPaymentActive] = useState(false)
  const [page, setPage] = useState(1)

  const [newOrderOpen, setNewOrderOpen] = useState(false)
  const [editOrder, setEditOrder] = useState(null)
  const [paymentOrderId, setPaymentOrderId] = useState(null)
  const [timelineOrderId, setTimelineOrderId] = useState(null)

  const isViewAll = canViewAllOrders(currentUser, permissions)

  async function refreshOrders() {
    const rows = await fetchFmsOrders({ currentUser, permissions })
    setOrders(rows)
  }

  useEffect(() => {
    async function loadAll() {
      setLoading(true)
      setError('')
      try {
        const [ords, prods, locs, emp, support] = await Promise.all([
          fetchFmsOrders({ currentUser, permissions }),
          fetchFmsProducts(),
          fetchFmsLocations(),
          fetchEmployeeNameMap(),
          fetchSupportPersons(),
        ])
        setOrders(ords)
        setProducts(prods)
        setLocations(locs)
        setEmpMap(emp)
        setSupportPersons(support)
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-time fetch
  }, [])

  const createdByOptions = useMemo(() => {
    const emails = [...new Set(orders.map((o) => o.created_by).filter(Boolean))].sort()
    return emails.map((e) => ({ email: e, name: empName(empMap, e) }))
  }, [orders, empMap])

  const locationOptions = useMemo(() => [...new Set(locations.map((l) => l.location_name))].sort(), [locations])

  const filteredOrders = useMemo(() => {
    const q = search.toLowerCase()
    return orders.filter((o) => {
      const clientName = (o.client_name || '').toLowerCase()
      const so = (o.so_number || '').toLowerCase()
      const ticket = (o.ticket_no || '').toLowerCase()
      const loc = o.location_type === 'outside' ? o.location_manual || '' : locations.find((l) => l.id === o.location_id)?.location_name || ''

      if (search && !clientName.includes(q) && !so.includes(q) && !ticket.includes(q)) return false
      if (statusFilter && o.status !== statusFilter) return false
      if (createdBy && (o.created_by || '').toLowerCase() !== createdBy.toLowerCase()) return false
      if (clientType && (o.client_type || 'existing') !== clientType) return false
      if (locationFilter && loc !== locationFilter) return false
      if (dateFrom && o.created_at < dateFrom) return false
      if (dateTo && o.created_at.slice(0, 10) > dateTo) return false
      if (pendingPaymentActive && calcPendingAmount(o) <= 0) return false
      return true
    })
  }, [orders, search, statusFilter, createdBy, clientType, locationFilter, dateFrom, dateTo, pendingPaymentActive, locations])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset to page 1 whenever any filter changes
    setPage(1)
  }, [search, statusFilter, createdBy, clientType, locationFilter, dateFrom, dateTo, pendingPaymentActive])

  const kpiSummary = useMemo(() => computeFmsKpiSummary(filteredOrders), [filteredOrders])

  // Matches fmsResetFilters exactly — clears search/created-by/location/dates
  // and the pending-payment toggle, but deliberately leaves Client Type alone.
  function handleReset() {
    setSearch('')
    setCreatedBy('')
    setLocationFilter('')
    setDateFrom('')
    setDateTo('')
    setPendingPaymentActive(false)
  }

  async function handleDelete(orderId) {
    const order = orders.find((o) => o.id === orderId)
    if (!order) return
    if (!window.confirm(`Delete order "${order.so_number}" for "${order.client_name}"?\n\nThis cannot be undone.`)) return
    setTimelineOrderId(null)
    try {
      await deleteOrder(orderId)
      await refreshOrders()
    } catch (e) {
      window.alert('❌ Delete failed: ' + e.message)
    }
  }

  const timelineOrder = orders.find((o) => o.id === timelineOrderId) || null
  const paymentOrder = orders.find((o) => o.id === paymentOrderId) || null

  return (
    <div className="px-4 sm:px-6 py-5">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div>
          <div className="text-[16px] font-semibold text-text">FMS Installation Tracker</div>
          <div className="text-[11.5px] text-text-muted mt-0.5">Home › FMS › Orders</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={refreshOrders}
            className="text-[12px] font-medium text-primary border border-primary/30 rounded-md px-3 py-1.5"
          >
            ↻ Refresh
          </button>
          {canCreateOrder(currentUser, permissions) && (
            <button
              type="button"
              onClick={() => {
                setEditOrder(null)
                setNewOrderOpen(true)
              }}
              className="text-[12px] font-semibold text-white bg-primary rounded-md px-3.5 py-1.5"
            >
              + New Order
            </button>
          )}
        </div>
      </div>

      {loading && <div className="text-center py-16 text-text-muted text-[13px]">⏳ Loading orders…</div>}
      {!loading && error && <div className="text-center py-16 text-danger text-[13px]">⚠️ {error}</div>}

      {!loading && !error && (
        <div>
          <FMSKpiGrid
            summary={kpiSummary}
            statusFilter={statusFilter}
            onStatusFilter={setStatusFilter}
            pendingPaymentActive={pendingPaymentActive}
            onTogglePendingPayment={() => setPendingPaymentActive((v) => !v)}
          />

          <FMSFilterBar
            search={search}
            onSearchChange={setSearch}
            clientType={clientType}
            onClientTypeChange={setClientType}
            showCreatedBy={isViewAll}
            createdBy={createdBy}
            onCreatedByChange={setCreatedBy}
            createdByOptions={createdByOptions}
            location={locationFilter}
            onLocationChange={setLocationFilter}
            locationOptions={locationOptions}
            dateFrom={dateFrom}
            onDateFromChange={setDateFrom}
            dateTo={dateTo}
            onDateToChange={setDateTo}
            onReset={handleReset}
            count={`${filteredOrders.length} order${filteredOrders.length !== 1 ? 's' : ''}`}
          />

          <FMSPipelineTable
            orders={filteredOrders}
            page={page}
            onPageChange={setPage}
            locations={locations}
            products={products}
            empMap={empMap}
            onOpenTimeline={setTimelineOrderId}
          />
        </div>
      )}

      <NewOrderModal
        open={newOrderOpen}
        onClose={() => {
          setNewOrderOpen(false)
          setEditOrder(null)
        }}
        editOrder={editOrder}
        products={products}
        locations={locations}
        supportPersons={supportPersons}
        empMap={empMap}
        onSaved={refreshOrders}
      />

      <UpdatePaymentModal
        open={!!paymentOrderId}
        order={paymentOrder}
        onClose={() => setPaymentOrderId(null)}
        onSaved={refreshOrders}
      />

      <TimelineModal
        open={!!timelineOrderId}
        orderId={timelineOrderId}
        order={timelineOrder}
        currentUser={currentUser}
        permissions={permissions}
        locations={locations}
        products={products}
        empMap={empMap}
        onClose={() => setTimelineOrderId(null)}
        onEdit={(orderId) => {
          setEditOrder(orders.find((o) => o.id === orderId) || null)
          setNewOrderOpen(true)
        }}
        onDelete={handleDelete}
        onOpenPayment={setPaymentOrderId}
      />
    </div>
  )
}
