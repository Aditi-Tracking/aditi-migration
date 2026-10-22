import { useEffect, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { anchorInView, computePopoverPosition } from './popoverPosition'

const FOCUSABLE = 'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
const stop = (e) => e.stopPropagation()

// A popover anchored to a trigger element, for use inside tables (header filters, row menus, the
// manage-list editor). Generalises the approach MappingOdooCell already uses for its dropdown:
//   - portalled to <body> with position:fixed, so the table's overflow-x-auto wrapper and the sticky
//     header clone (overflow:hidden) can never clip it;
//   - flips above the anchor when there isn't room below, clamps to the viewport horizontally, and caps
//     its height (scrolling internally) — see computePopoverPosition;
//   - closes on an outside press, Escape, keyboard focus leaving it, and any outside scroll or resize.
//     It deliberately does NOT follow its anchor around: fixed coordinates go stale on scroll, and
//     "close" is the existing convention (Mapping) — one behaviour everywhere.
// `open` is controlled by the parent, which owns the trigger button and toggles it; pressing the
// trigger while the popover is open is NOT treated as an outside press, so the trigger's own click
// handler closes it (otherwise press-closes-then-click-reopens).
//
// React events from a portal bubble through the React tree, not the DOM tree — so a click inside the
// popover would reach a clickable ancestor like <th onClick={sort}> or <tr onClick={openDetail}>.
// The popover root therefore stops click/double-click propagation.
//
// Focus moves into the popover on open ([data-autofocus] first, else the first focusable) without
// scrolling the page (a scroll would trip the close-on-scroll rule), and returns to the trigger on close.
// Tabbing past either end (Tab on the last control, Shift+Tab on the first) closes it and lands on the
// trigger — not a focus trap, but never "focus escapes to the browser UI with the popover left open".
// Runs under <StrictMode> (effects fire twice in dev): every effect here is idempotent.
export default function PortalPopover({ anchorRef, open, onClose, width = 280, align = 'start', ariaLabel, className = '', children }) {
  const popRef = useRef(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose // listeners always call the latest callback without re-subscribing
  }, [onClose])

  // Position before first paint, imperatively (no state → no extra render, no flash).
  useLayoutEffect(() => {
    if (!open) return
    const pop = popRef.current
    const anchorEl = anchorRef.current
    if (!pop || !anchorEl) return
    const viewport = { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight }
    const rect = anchorEl.getBoundingClientRect()
    if (!anchorInView(rect, viewport)) {
      onCloseRef.current()
      return
    }
    pop.style.maxHeight = '' // measure the natural height
    const pos = computePopoverPosition(rect, { width, height: pop.offsetHeight }, viewport, { align })
    pop.style.left = pos.left + 'px'
    pop.style.width = pos.width + 'px'
    pop.style.maxHeight = pos.maxHeight + 'px'
    pop.style.top = pos.top !== undefined ? pos.top + 'px' : 'auto'
    pop.style.bottom = pos.bottom !== undefined ? pos.bottom + 'px' : 'auto'
  }, [open, anchorRef, width, align])

  // Closing rules.
  useEffect(() => {
    if (!open) return undefined
    // Event targets are not always DOM nodes (a scroll can target `window` itself), and Node.contains()
    // throws on a non-Node — so test for a node first. (nodeType rather than instanceof Node, which
    // breaks across iframes/realms.)
    const within = (container, t) => !!(container && t && t.nodeType && container.contains(t))
    const insidePopover = (t) => within(popRef.current, t)
    const onAnchor = (t) => within(anchorRef.current, t)
    const onPointerDown = (e) => {
      if (!insidePopover(e.target) && !onAnchor(e.target)) onCloseRef.current()
    }
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onCloseRef.current()
    }
    const onScroll = (e) => {
      if (!insidePopover(e.target)) onCloseRef.current() // scrolling the popover's own list is fine
    }
    const onResize = () => onCloseRef.current()
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
  }, [open, anchorRef])

  // Focus in on open, back to the trigger on close.
  useEffect(() => {
    if (!open) return undefined
    const pop = popRef.current
    const anchorEl = anchorRef.current
    const opener = document.activeElement
    ;(pop.querySelector('[data-autofocus]') || pop.querySelector(FOCUSABLE) || pop).focus({ preventScroll: true })
    return () => {
      const active = document.activeElement
      // Only steal focus back if it was lost with the popover (or never left it) — never from a control the user moved to.
      if (!active || active === document.body || pop.contains(active)) {
        const back = anchorEl && anchorEl.isConnected ? anchorEl : opener
        if (back && back.focus) back.focus({ preventScroll: true })
      }
    }
  }, [open, anchorRef])

  if (!open) return null

  return createPortal(
    <div
      ref={popRef}
      role="dialog"
      aria-label={ariaLabel}
      tabIndex={-1}
      onClick={stop}
      onDoubleClick={stop}
      onKeyDown={(e) => {
        if (e.key !== 'Tab') return
        const items = [...popRef.current.querySelectorAll(FOCUSABLE)]
        const edge = e.shiftKey ? items[0] : items[items.length - 1]
        if (!items.length || document.activeElement === edge || document.activeElement === popRef.current) {
          e.preventDefault()
          onCloseRef.current()
        }
      }}
      onBlur={(e) => {
        // Keyboard focus left the popover for something else (Tab). relatedTarget is null when a
        // plain non-focusable area was clicked — that is not "leaving", so it's ignored here.
        const next = e.relatedTarget
        if (next && !popRef.current.contains(next) && !(anchorRef.current && anchorRef.current.contains(next))) onCloseRef.current()
      }}
      style={{ position: 'fixed', width }}
      className={`z-[600] overflow-y-auto bg-surface border border-border rounded-xl shadow-lg outline-none ${className}`}
    >
      {children}
    </div>,
    document.body
  )
}
