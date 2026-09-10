// Ported from old-portal/js/responsive.js verbatim. UA-string based — used
// for JS-side branching (e.g. the file viewer's mobile-new-tab fallback),
// not for layout (layout breakpoints stay in Tailwind's `md:` classes).
export function isTabletDevice() {
  return /iPad/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export function isMobileDevice() {
  return /Android|iPhone|iPod|Mobile/i.test(navigator.userAgent) && !isTabletDevice()
}

export function isDesktopDevice() {
  return !isMobileDevice() && !isTabletDevice()
}
