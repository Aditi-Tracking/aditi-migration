// Fixed widths (w = min = max) of the SCOT list: a long value truncates, it never widens a column or wraps the row (the fixed-row-height rule).
export const COL = {
  select: 'w-8',
  num: 'w-[64px] min-w-[64px] max-w-[64px]',
  name: 'w-[190px] min-w-[190px] max-w-[190px]',
  phone: 'w-[130px] min-w-[130px] max-w-[130px]',
  opportunity: 'w-[220px] min-w-[220px] max-w-[220px]',
  email: 'w-[190px] min-w-[190px] max-w-[190px]',
  city: 'w-[110px] min-w-[110px] max-w-[110px]',
  salesPerson: 'w-[120px] min-w-[120px] max-w-[120px]',
  leadSource: 'w-[120px] min-w-[120px] max-w-[120px]',
  remark: 'w-[220px] min-w-[220px] max-w-[220px]',
  lastCalled: 'w-[140px] min-w-[140px] max-w-[140px]',
  outcome: 'w-[130px] min-w-[130px] max-w-[130px]',
  nextCall: 'w-[170px] min-w-[170px] max-w-[170px]',
  calls: 'w-[72px] min-w-[72px] max-w-[72px]',
  status: 'w-[110px] min-w-[110px] max-w-[110px]',
  createdVia: 'w-[120px] min-w-[120px] max-w-[120px]',
  action: 'w-[104px] min-w-[104px] max-w-[104px]',
}

// The tiles above the list (see ScotKpiStrip). `filters`: what picking the tile puts on the list; null = not a filter.
export const SCOT_TILES = [
  { key: 'active', label: 'Active', filters: { status: ['active'] } },
  { key: 'never_called', label: 'Never called', filters: { status: ['active'], calls: ['0'] }, tone: 'text-primary' },
  { key: 'overdue', label: 'Overdue', filters: { state: ['overdue'] }, tone: 'text-danger' },
  { key: 'due_today', label: 'Due today', filters: { state: ['due_today'] }, tone: 'text-[#B77900]' },
  { key: 'not_scheduled', label: 'Not scheduled', filters: { state: ['not_scheduled'] }, tone: 'text-text-muted' },
  { key: 'called_this_week', label: 'Called this week', filters: null, tone: 'text-primary' },
  { key: 'won_back', label: 'Won back', filters: { status: ['won_back'] }, tone: 'text-[#16A34A]' },
]

// The columns a person may show or hide (the column picker) — in table order. The selection checkbox, the row number and the Call button are structural, not
// data, and are not listed. `defaultVisible`: what someone who has never touched the picker sees — what is needed to pick up the phone and log a call:
// who, their number, what came of the last call, and when the next one is due (its badge also says Overdue / Won back / Dropped, so Status is optional).
// `locked`: always shown (a row without its contact name means nothing).
export const SCOT_COLUMNS = [
  { key: 'name', label: 'Contact', defaultVisible: true, locked: true },
  { key: 'phone', label: 'Phone', defaultVisible: true },
  { key: 'opportunity', label: 'Opportunity', defaultVisible: false },
  { key: 'email', label: 'Email', defaultVisible: false },
  { key: 'city', label: 'City', defaultVisible: false },
  { key: 'salesPerson', label: 'Sales Person', defaultVisible: false },
  { key: 'leadSource', label: 'Source', defaultVisible: false },
  { key: 'remark', label: 'Remark', defaultVisible: false },
  { key: 'lastCalled', label: 'Last Called', defaultVisible: false },
  { key: 'lastOutcome', label: 'Last Outcome', defaultVisible: true },
  { key: 'nextCall', label: 'Next Call', defaultVisible: true },
  { key: 'calls', label: 'Calls', defaultVisible: false },
  { key: 'status', label: 'Status', defaultVisible: false },
  { key: 'createdVia', label: 'Added via', defaultVisible: false },
]
// Which filters (keys of SCOT_FILTER_SPEC) belong to which column: a column with one of these applied cannot be hidden.
export const SCOT_COLUMN_FILTERS = {
  name: ['name'], phone: ['phone'], opportunity: ['opportunity'], city: ['city'], salesPerson: ['salesPerson'], leadSource: ['leadSource'],
  nextCall: ['state', 'nextCall'], calls: ['calls'], status: ['status'], createdVia: ['createdVia'],
}
