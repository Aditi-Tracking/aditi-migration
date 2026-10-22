import { activeOptionValues } from '../../../lib/enquiries'

// Shared by the sheet's header, saved rows and draft rows so every row of a column is the same width —
// written out as literal class strings because Tailwind only emits classes it can see in the source.
// Width is FIXED (w = min = max): an inline <input> would otherwise stretch its column to its own default
// width, and a long value must truncate, never widen the table or wrap (the fixed-row-height rule).
export const COL = {
  check: 'w-8 min-w-8 px-2',
  details: 'w-[64px] min-w-[64px] max-w-[64px]',
  date: 'w-[136px] min-w-[136px] max-w-[136px]',
  name: 'w-[170px] min-w-[170px] max-w-[170px]',
  company: 'w-[180px] min-w-[180px] max-w-[180px]',
  phone: 'w-[140px] min-w-[140px] max-w-[140px]',
  email: 'w-[190px] min-w-[190px] max-w-[190px]',
  requirement: 'w-[230px] min-w-[230px] max-w-[230px]',
  source: 'w-[140px] min-w-[140px] max-w-[140px]',
  salesPerson: 'w-[150px] min-w-[150px] max-w-[150px]',
  clientType: 'w-[110px] min-w-[110px] max-w-[110px]',
  status: 'w-[130px] min-w-[130px] max-w-[130px]',
  channel: 'w-[130px] min-w-[130px] max-w-[130px]',
  fms: 'w-[90px] min-w-[90px] max-w-[90px]',
}

// A managed list ([{ id, value, is_active }]) as <select> options — ACTIVE values only; a row's own retired
// value is appended by InlineSelectCell itself. null (lists still loading) -> no options.
export const managedOptions = (list) => activeOptionValues(list).map((v) => ({ value: v, label: v }))
