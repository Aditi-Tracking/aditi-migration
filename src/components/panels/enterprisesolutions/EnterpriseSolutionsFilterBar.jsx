// Ported from index.html's .filters-bar inside #panel-entsol. Fixed-light styling.
export default function EnterpriseSolutionsFilterBar({ search, onSearchChange, typeFilter, onTypeChange, onReset }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white border border-[#e9ecf5] shadow-[0_1px_2px_rgba(15,23,42,0.04)] p-3 mb-4">
      <span className="text-[11px] font-semibold text-[#8891a5]">Filter:</span>
      <input
        type="text"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search customer, school, location..."
        className="flex-1 min-w-[180px] rounded-md border border-[#e9ecf5] bg-[#f4f6fb] px-3 py-1.5 text-[12.5px] text-[#1e293b] outline-none"
      />
      <select value={typeFilter} onChange={(e) => onTypeChange(e.target.value)} className="rounded-md border border-[#e9ecf5] bg-[#f4f6fb] px-2.5 py-1.5 text-[12px] text-[#1e293b] outline-none">
        <option value="">All Types</option>
        <option value="Customer">Customers</option>
        <option value="Trial">Trials</option>
      </select>
      <button type="button" onClick={onReset} className="text-[12px] font-semibold rounded-md border border-[#e9ecf5] bg-[#f4f6fb] text-[#64748b] px-3 py-1.5">
        ↺ Reset
      </button>
    </div>
  )
}
