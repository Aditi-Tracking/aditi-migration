import { useEffect, useRef, useState } from 'react'

// Gives any shared-table header a page-scroll-pinned clone while its body
// scrolls horizontally — see Table.jsx, which renders the actual clone
// markup. A genuinely separate header element is required here, not
// position:sticky on the real <thead>: any ancestor with overflow-x:auto
// (needed for horizontal scroll on a wide table) unconditionally becomes
// the nearest scroll-container ancestor for position:sticky's containment
// algorithm, and since that container's own height is unbounded, sticky
// positioned relative to it is functionally inert — the header would just
// scroll away with the page. Confirmed empirically (headless Chromium,
// several overflow-x/overflow-y combinations) before building this; there
// is no CSS-only way around it.
//
// Deliberately built on plain scroll/resize listeners + getBoundingClientRect
// rather than ResizeObserver/IntersectionObserver — this project's own test
// runner never fires either observer callback at all (verified in
// isolation), and since scroll/resize + rect reads are strictly older,
// simpler primitives, they're at least as broadly supported in real
// browsers. Position/width sync is fully imperative (direct DOM writes, no
// React state) since it can run many times a second while scrolling — only
// the boolean "is it stuck" flips through React state, and only when it
// actually changes.
//
// Also drives `stripRef` — a faux horizontal-scrollbar strip (a single
// 1px-tall spacer inside its own overflow-x:auto box) rendered inside the
// clone, directly under the header cells, so the scrollbar is reachable
// without scrolling to the bottom of a long table. It's a genuinely
// interactive, two-way sync with the real table (dragging it scrolls the
// table; scrolling the table moves it) — not the one-way cosmetic
// transform the clone's own header cells get. The mutual "ignore the next
// echo" flags below are the same pattern validated in isolation before
// this was wired in: each side sets its own flag immediately before
// writing the other's scrollLeft, so the resulting scroll event on that
// side is recognized as its own echo and skipped, instead of being
// mistaken for new user input and bounced back again.
export function useStickyClonedHeader(scrollRef, cloneWrapRef, stripRef) {
  const [stuck, setStuck] = useState(false)
  const stuckRef = useRef(false)

  useEffect(() => {
    let ticking = false
    let rafId = null
    let ignoreRealEcho = false
    let ignoreStripEcho = false

    function measureAndSync() {
      const scrollEl = scrollRef.current
      const cloneWrap = cloneWrapRef.current
      if (!scrollEl || !cloneWrap) return
      const theadEl = scrollEl.querySelector('thead')
      const cloneTheadEl = cloneWrap.querySelector('thead')
      if (!theadEl || !cloneTheadEl) return

      const theadRect = theadEl.getBoundingClientRect()
      const wrapRect = scrollEl.getBoundingClientRect()
      // Stick while the header is above the viewport AND the table still has
      // at least one header-height of itself left below the viewport top —
      // otherwise a short table (a handful of rows) would leave a floating
      // header pinned with nothing visible underneath it.
      const shouldStick = theadRect.top < 0 && wrapRect.bottom > theadRect.height

      if (shouldStick !== stuckRef.current) {
        stuckRef.current = shouldStick
        setStuck(shouldStick)
      }
      if (!shouldStick) return

      cloneWrap.style.left = wrapRect.left + 'px'
      cloneWrap.style.width = wrapRect.width + 'px'

      const realThs = theadEl.querySelectorAll('th')
      const cloneThs = cloneTheadEl.querySelectorAll('th')
      const cloneTable = cloneTheadEl.closest('table')
      let total = 0
      realThs.forEach((th, i) => {
        const w = th.getBoundingClientRect().width
        total += w
        if (cloneThs[i]) cloneThs[i].style.width = w + 'px'
      })
      if (cloneTable) {
        cloneTable.style.width = total + 'px'
        cloneTable.style.transform = `translateX(${-scrollEl.scrollLeft}px)`
      }

      // Keep the strip's scrollable width matched to the real table's full
      // width (can change on window resize or a data change that alters
      // column widths) and correct any drift — e.g. a resize that
      // shrinks scrollWidth enough to force the real table's scrollLeft
      // to clamp down, which the strip needs to mirror too.
      const stripEl = stripRef.current
      if (stripEl) {
        const spacer = stripEl.firstElementChild
        if (spacer) spacer.style.width = scrollEl.scrollWidth + 'px'
        if (stripEl.scrollLeft !== scrollEl.scrollLeft) {
          ignoreStripEcho = true
          stripEl.scrollLeft = scrollEl.scrollLeft
        }
      }
    }

    function requestSync() {
      if (ticking) return
      ticking = true
      rafId = requestAnimationFrame(() => {
        ticking = false
        measureAndSync()
      })
    }

    // Fires on every real-table horizontal scroll — whether genuine user
    // input or our own write from onStripScroll below — so the clone
    // header's cosmetic transform and the strip's scrollLeft both track
    // immediately, rather than waiting behind requestSync's rAF (which
    // exists for the vertical-scroll-driven stuck/position recompute, not
    // for this).
    function onRealScroll() {
      if (!stuckRef.current) return
      const scrollEl = scrollRef.current
      const cloneWrap = cloneWrapRef.current
      const cloneTable = cloneWrap && cloneWrap.querySelector('table')
      if (scrollEl && cloneTable) cloneTable.style.transform = `translateX(${-scrollEl.scrollLeft}px)`

      const stripEl = stripRef.current
      if (!scrollEl || !stripEl) return
      if (ignoreRealEcho) {
        ignoreRealEcho = false
        return
      }
      ignoreStripEcho = true
      stripEl.scrollLeft = scrollEl.scrollLeft
    }

    function onStripScroll() {
      if (ignoreStripEcho) {
        ignoreStripEcho = false
        return
      }
      const scrollEl = scrollRef.current
      const stripEl = stripRef.current
      if (!scrollEl || !stripEl) return
      ignoreRealEcho = true
      scrollEl.scrollLeft = stripEl.scrollLeft
    }

    measureAndSync()
    window.addEventListener('scroll', requestSync, { passive: true })
    window.addEventListener('resize', requestSync, { passive: true })
    const scrollEl = scrollRef.current
    if (scrollEl) scrollEl.addEventListener('scroll', onRealScroll, { passive: true })
    const stripEl = stripRef.current
    if (stripEl) stripEl.addEventListener('scroll', onStripScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', requestSync)
      window.removeEventListener('resize', requestSync)
      if (scrollEl) scrollEl.removeEventListener('scroll', onRealScroll)
      if (stripEl) stripEl.removeEventListener('scroll', onStripScroll)
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [scrollRef, cloneWrapRef, stripRef])

  return stuck
}
