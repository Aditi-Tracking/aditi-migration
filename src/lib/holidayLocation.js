// Ported from old-portal/js/hr.js's _holNormLoc — shared by HolidayOverlay
// (HR's Holiday List) and the Task Scheduler tab (holiday-aware date
// shifting), both of which need the exact same mapping. Previously
// duplicated as a local copy inside HolidayOverlay.jsx; extracted here so
// both call sites can never drift out of sync.
export function normalizeHolidayLocation(loc) {
  const l = (loc || '').toLowerCase().trim()
  if (l.includes('goa')) return 'Goa'
  if (l.includes('bangalore') || l.includes('bengaluru')) return 'Bangalore'
  if (l.includes('gujarat') || l.includes('surat') || l.includes('ahmedabad')) return 'Gujarat'
  // Employee_details stores this as "HeadOffice" (no space) for most staff,
  // while the Holiday List sheet's Location column may use "Head Office"
  // (with a space) — match both, plus a hyphenated variant.
  if (l.includes('mumbai') || l.includes('head office') || l.includes('headoffice') || l.includes('head-office')) return 'Mumbai'
  return loc || 'All'
}
