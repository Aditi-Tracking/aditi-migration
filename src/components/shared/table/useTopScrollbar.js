import { useEffect, useRef } from 'react'

// An always-visible horizontal scrollbar for a wide table, shown directly above its header — the table's own scrollbar
// sits at the very bottom, out of reach on a long table. Opt-in through <Table topScrollbar> (see Table.jsx); when
// `enabled` is false this hook does nothing at all, so every other table in the portal is untouched.
//
// `topRef` is a thin overflow-x:auto strip holding one spacer; the spacer is kept as wide as the real table, so
// dragging the strip scrolls it, and scrolling the table moves the strip. The two stay in step by COMPARING positions
// rather than by "ignore the next echo" flags: each scroll event copies its scrollLeft to the other side only when the
// two differ by more than a pixel, so the echo the copy causes finds them equal and stops — no flag can get stuck when
// a copy happens to produce no event (a clamped or unchanged value).
// THE ONE THAT IS MOVING WINS. A scroll can be animated (keyboard arrows, smooth scrolling, trackpad momentum): the other
// side's echo event then arrives a frame late and reads a value the animation has already passed — copying THAT back would
// drag the table backwards and cut the animation short. So whichever side last produced a scroll event "drives" for a short
// window (DRIVE_MS), and the other side's events inside that window are its own echoes and are ignored. It is a time window,
// not a flag, so it can never stay stuck. The strip hides itself while the table does not
// overflow (a wide window), and re-measures on resize, whenever the component renders (the table's width can change
// with its columns or data), and, where the browser has it, when the table itself is resized.
// (While the page is scrolled so the table's header is pinned, Table's own sticky clone carries a second strip.)
const DRIVE_MS = 150

export function useTopScrollbar(scrollRef, topRef, enabled) {
  const syncRef = useRef(null)

  useEffect(() => {
    if (!enabled) return undefined
    const scrollEl = scrollRef.current
    const topEl = topRef.current
    if (!scrollEl || !topEl) return undefined
    const spacer = topEl.firstElementChild
    let driver = null // 'real' | 'top' — which side last produced a scroll event
    let driverAt = 0
    const drives = (who) => driver === who && performance.now() - driverAt < DRIVE_MS
    const claim = (who) => {
      driver = who
      driverAt = performance.now()
    }

    function sync() {
      const overflow = scrollEl.scrollWidth > scrollEl.clientWidth + 1
      topEl.style.display = overflow ? '' : 'none'
      if (spacer) spacer.style.width = scrollEl.scrollWidth + 'px'
      // a re-measure (resize, a render) must never fight a drag of the strip that is in progress
      if (overflow && !drives('top') && Math.abs(topEl.scrollLeft - scrollEl.scrollLeft) > 1) topEl.scrollLeft = scrollEl.scrollLeft
    }
    const onReal = () => {
      if (drives('top')) return // the echo of the strip's own write
      claim('real')
      if (Math.abs(topEl.scrollLeft - scrollEl.scrollLeft) > 1) topEl.scrollLeft = scrollEl.scrollLeft
    }
    const onTop = () => {
      if (drives('real')) return // the echo of the table's own scroll (possibly a frame stale mid-animation)
      claim('top')
      if (Math.abs(topEl.scrollLeft - scrollEl.scrollLeft) > 1) scrollEl.scrollLeft = topEl.scrollLeft
    }

    syncRef.current = sync
    sync()
    scrollEl.addEventListener('scroll', onReal, { passive: true })
    topEl.addEventListener('scroll', onTop, { passive: true })
    window.addEventListener('resize', sync, { passive: true })
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(sync) : null
    observer?.observe(scrollEl)
    return () => {
      syncRef.current = null
      scrollEl.removeEventListener('scroll', onReal)
      topEl.removeEventListener('scroll', onTop)
      window.removeEventListener('resize', sync)
      observer?.disconnect()
    }
  }, [scrollRef, topRef, enabled])

  // After every render: the table may have become wider or narrower.
  useEffect(() => {
    syncRef.current?.()
  })
}
