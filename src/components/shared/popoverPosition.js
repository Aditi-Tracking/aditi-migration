// Pure placement maths for PortalPopover — a separate, DOM-free file so it can be unit-tested and so
// PortalPopover.jsx exports only a component (react-refresh requirement).
//
// All numbers are CSS pixels in viewport coordinates (what getBoundingClientRect() returns).
//   anchor   : { top, bottom, left, right, width, height } of the trigger element
//   size     : { width, height } the popover wants (height = its natural, unclamped height)
//   viewport : { width, height } of the VISIBLE area (documentElement.clientWidth/Height — not
//              window.innerWidth, which includes the reserved scrollbar gutter this app always has)
// Placement rule: below the anchor when it fits; otherwise whichever side has more room (above is
// anchored by its BOTTOM edge, so content that grows later expands upward instead of off-screen).
// Whatever side is chosen, maxHeight caps the popover to the room there, so it scrolls internally
// instead of running off the screen.
export const POPOVER_MARGIN = 8 // never closer than this to a viewport edge
export const POPOVER_GAP = 4 // space between the anchor and the popover

export function computePopoverPosition(anchor, size, viewport, { align = 'start', margin = POPOVER_MARGIN, gap = POPOVER_GAP } = {}) {
  const width = Math.min(size.width, Math.max(0, viewport.width - margin * 2))

  let left = align === 'end' ? anchor.right - width : anchor.left
  left = Math.max(margin, Math.min(left, viewport.width - margin - width))

  const spaceBelow = viewport.height - anchor.bottom - gap - margin
  const spaceAbove = anchor.top - gap - margin
  const placement = size.height <= spaceBelow || spaceBelow >= spaceAbove ? 'down' : 'up'
  const maxHeight = Math.max(0, placement === 'down' ? spaceBelow : spaceAbove)

  return placement === 'down'
    ? { placement, left, width, maxHeight, top: anchor.bottom + gap }
    : { placement, left, width, maxHeight, bottom: viewport.height - anchor.top + gap }
}

// A zero-size rect is what display:none (e.g. the sticky header clone while hidden) reports; a rect
// entirely outside the viewport is an anchor that has scrolled away. Neither can host a popover.
export function anchorInView(anchor, viewport) {
  if (!anchor || (anchor.width === 0 && anchor.height === 0)) return false
  return anchor.bottom > 0 && anchor.right > 0 && anchor.top < viewport.height && anchor.left < viewport.width
}
