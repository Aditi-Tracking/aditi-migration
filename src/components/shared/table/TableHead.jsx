// The one styled header row every table shares — bg-surface-2 fill, hairline
// bottom border. Standardizes the header background that several tables
// (Vendor Requests, Renewals) previously omitted entirely.
export default function TableHead({ children }) {
  return (
    <thead>
      <tr className="bg-surface-2 border-b border-border text-left">{children}</tr>
    </thead>
  )
}
