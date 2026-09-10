// Module-level cache mirroring old-portal/js/hr.js's `_holidayAllData`/
// `_holidayFetched` globals — fetched once, reused across re-opens of the
// Holiday overlay (and later, a Home panel prefetch can populate this same
// cache before the overlay is ever opened).
export const holidayCache = {
  rows: [],
  fetched: false,
}
