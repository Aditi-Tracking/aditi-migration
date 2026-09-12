import { useState } from 'react'
import { CATEGORIES, distinctValues, filterEmployees } from '../../../lib/hrEmployee'
import EmployeeTable from './EmployeeTable'

const INITIAL = { search: '', location: '', department: '', category: '', designation: '' }

// Ported from old-portal/js/hrEmployee.js's heRenderEmployeeList/heFilteredEmployees/
// heResetListFilters. Category options are the 3 hardcoded values (matches production —
// heRenderEmployeeList hardcodes the category <select>'s options, unlike Location/Department/
// Designation which are derived from whatever distinct values currently exist in the data).
export default function EmployeeListTab({ employees, onOpenEmployee }) {
  const [filters, setFilters] = useState(INITIAL)

  const locations = distinctValues(employees, 'location')
  const departments = distinctValues(employees, 'department')
  const designations = distinctValues(employees, 'designation')
  const rows = filterEmployees(employees, filters)

  function set(patch) {
    setFilters((prev) => ({ ...prev, ...patch }))
  }

  return (
    <div>
      <div className="rounded-xl border border-border bg-surface p-3 flex flex-wrap gap-2.5 items-center mb-3.5">
        <input
          type="text"
          value={filters.search}
          onChange={(e) => set({ search: e.target.value })}
          placeholder="🔍 Search name, email, contact..."
          className="flex-1 min-w-[200px] px-3 py-2 rounded-lg border border-border bg-surface-2 text-text text-[12.5px] outline-none"
        />
        <select value={filters.location} onChange={(e) => set({ location: e.target.value })} className="px-2.5 py-2 rounded-lg border border-border bg-surface-2 text-text text-[12.5px]">
          <option value="">All Locations</option>
          {locations.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <select value={filters.department} onChange={(e) => set({ department: e.target.value })} className="px-2.5 py-2 rounded-lg border border-border bg-surface-2 text-text text-[12.5px]">
          <option value="">All Departments</option>
          {departments.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <select value={filters.category} onChange={(e) => set({ category: e.target.value })} className="px-2.5 py-2 rounded-lg border border-border bg-surface-2 text-text text-[12.5px]">
          <option value="">All Categories</option>
          {CATEGORIES.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <select value={filters.designation} onChange={(e) => set({ designation: e.target.value })} className="px-2.5 py-2 rounded-lg border border-border bg-surface-2 text-text text-[12.5px]">
          <option value="">All Designations</option>
          {designations.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => setFilters({ ...INITIAL })} className="px-3 py-2 rounded-lg border border-border text-text-muted text-[12.5px] font-semibold">
          Reset
        </button>
        <span className="text-[12px] text-text-muted ml-1">
          {rows.length} of {employees.length} employees
        </span>
      </div>

      <EmployeeTable rows={rows} showChecklist={false} onRowClick={onOpenEmployee} />
    </div>
  )
}
