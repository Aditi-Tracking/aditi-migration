// Fixed widths (w = min = max) of the Sales FMS list: a long value truncates, it never widens a column or wraps the row (the fixed-row-height rule).
export const COL = {
  num: 'w-[64px] min-w-[64px] max-w-[64px]',
  name: 'w-[170px] min-w-[170px] max-w-[170px]',
  company: 'w-[160px] min-w-[160px] max-w-[160px]',
  phone: 'w-[120px] min-w-[120px] max-w-[120px]',
  salesPerson: 'w-[130px] min-w-[130px] max-w-[130px]',
  entered: 'w-[150px] min-w-[150px] max-w-[150px]',
  stage: 'w-[190px] min-w-[190px] max-w-[190px]',
  reason: 'w-[160px] min-w-[160px] max-w-[160px]',
  setTime: 'w-[190px] min-w-[190px] max-w-[190px]',
  closure: 'w-[190px] min-w-[190px] max-w-[190px]',
  status: 'w-[120px] min-w-[120px] max-w-[120px]',
}
