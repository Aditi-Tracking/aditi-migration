// Fixed widths (w = min = max) of the MeCa tables: a long value truncates, it never widens a column or wraps the row (the
// fixed-row-height rule). Shared by the Sales reps table and the period breakdown in the detail view.
export const MECA_COL = {
  name: 'w-[230px] min-w-[230px] max-w-[230px]',
  count: 'w-[84px] min-w-[84px] max-w-[84px]',
  pct: 'w-[96px] min-w-[96px] max-w-[96px]',
  money: 'w-[124px] min-w-[124px] max-w-[124px]',
  target: 'w-[172px] min-w-[172px] max-w-[172px]',
}
export const METRIC_COLUMNS = 8 // Meetings, Clients, Conversion, Turnover, Avg Rs Sale, Target, % of target, Gap
