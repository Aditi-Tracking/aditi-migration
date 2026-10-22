// Shared table shell — standardizes the rounded-card + optional title bar +
// horizontal-scroll wrapper pattern that most hand-rolled tables across the
// Dashboards Hub modules already approximate individually. `title`/`count`/
// `actions` are all optional — a table with no title bar (e.g. Vendor
// Requests) just omits them. `footer` is a slot for pagination controls.
//
// Forwards `ref` to the horizontal-scroll wrapper div — an escape hatch for
// tables that need to imperatively control scroll position (e.g. Renewals'
// My Customers resetting scrollLeft to 0 when its calendar window changes).
// Optional; every other consumer passes no ref and is unaffected.
//
// Also gives every table a page-scroll-pinned header for free, matching
// production's frozen-header behavior on a wide, horizontally-scrolling
// table — see useStickyClonedHeader.js for why a real separate clone
// element (rendered via portal below) is required rather than plain CSS.
// Verified live against real data (Renewals' My Customers, DevTools open):
// stuck/unstuck toggles correctly and the header stays visibly pinned.
//
// `colWidths` (optional, e.g. for FMS's explicit column-width allocation):
// an array of CSS width strings, one per column, rendered as a <colgroup>
// with table-layout:fixed. Orthogonal to the sticky-clone mechanism above —
// useStickyClonedHeader measures each real <th>'s actual rendered width via
// getBoundingClientRect() and writes that onto the clone, regardless of
// which layout algorithm produced it, so this needs no changes there.
// Omitted (every other table today), the table keeps its current
// table-layout:auto with no colgroup — fully backward compatible.
//
// `topScrollbar` (optional, default off — every table that does not pass it renders exactly as before): an
// always-visible horizontal scrollbar directly above the header, in the page's normal flow, for a wide table whose
// own scrollbar is at the very bottom. Hidden while the table does not overflow. See useTopScrollbar.js. Once the
// page scrolls past it, the sticky clone's strip below takes over.
//
// With the top strip on, the table's OWN native horizontal scrollbar (the one at the very bottom) is hidden — two scrollbars
// would be redundant. Only its visible chrome goes: the wrapper still scrolls exactly as before (trackpad, touch, shift+wheel,
// the keyboard, the top strip). A table that does not pass `topScrollbar` keeps its native scrollbar, since it has no other way
// to scroll sideways, and its wrapper's class string is byte-for-byte what it always was.
//
// The clone also carries a faux horizontal-scrollbar strip directly under
// the header cells (rendered whenever the clone itself is stuck) — for a
// long table, the real scrollbar sits at the very bottom of the whole
// table (standard overflow-x:auto behavior), which is impractical to
// reach once you're scrolled deep into hundreds of rows. Two-way
// scrollLeft sync with the real table, validated in isolation first —
// see useStickyClonedHeader.js.
import { Children, forwardRef, useRef } from 'react'
import { createPortal } from 'react-dom'
import TableHead from './TableHead'
import { useStickyClonedHeader } from './useStickyClonedHeader'
import { useTopScrollbar } from './useTopScrollbar'

// `scrollbar-width: none` (Firefox, Chrome/Edge 121+, Safari 18.2+) plus the older WebKit pseudo-element (Chrome/Edge/Safari before
// that) — together, every engine this app targets. Both leave scrolling itself untouched; they only stop the bar being drawn.
const HIDE_NATIVE_SCROLLBAR = '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden'

const Table = forwardRef(function Table({ title, count, countLabel = 'row', actions, footer, colWidths, topScrollbar = false, children }, ref) {
  const scrollRef = useRef(null)
  const cloneWrapRef = useRef(null)
  const stripRef = useRef(null)
  const topRef = useRef(null)
  const stuck = useStickyClonedHeader(scrollRef, cloneWrapRef, stripRef)
  useTopScrollbar(scrollRef, topRef, topScrollbar)

  const headChild = Children.toArray(children).find((child) => child.type === TableHead)

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      {(title || actions || count != null) && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border flex-wrap">
          {title && <span className="text-[13px] font-semibold text-text">{title}</span>}
          <div className="flex items-center gap-3 ml-auto">
            {count != null && (
              <span className="text-[11.5px] text-text-muted">
                {count} {countLabel}
                {count !== 1 ? 's' : ''}
              </span>
            )}
            {actions}
          </div>
        </div>
      )}
      {topScrollbar && (
        <div ref={topRef} data-role="top-scrollbar" aria-hidden="true" tabIndex={-1} className="overflow-x-auto overflow-y-hidden h-[14px] bg-surface-2 border-b border-border" style={{ display: 'none' }}>
          <div className="h-px" />
        </div>
      )}
      <div
        className={topScrollbar ? `overflow-x-auto ${HIDE_NATIVE_SCROLLBAR}` : 'overflow-x-auto'}
        ref={(node) => {
          scrollRef.current = node
          if (typeof ref === 'function') ref(node)
          else if (ref) ref.current = node
        }}
      >
        <table className="w-full text-[12.5px] border-collapse" style={colWidths ? { tableLayout: 'fixed' } : undefined}>
          {colWidths && (
            <colgroup>
              {colWidths.map((w, i) => (
                <col key={i} style={{ width: w }} />
              ))}
            </colgroup>
          )}
          {children}
        </table>
      </div>
      {footer}

      {headChild &&
        createPortal(
          <div
            ref={cloneWrapRef}
            className="rounded-b-lg shadow-lg"
            style={{ position: 'fixed', top: 0, overflow: 'hidden', zIndex: 30, display: stuck ? 'block' : 'none' }}
          >
            <table className="text-[12.5px] border-collapse" style={{ tableLayout: 'fixed' }}>
              {headChild}
            </table>
            <div ref={stripRef} className="overflow-x-auto overflow-y-hidden h-[14px] bg-surface-2 border-t border-border">
              <div className="h-px" />
            </div>
          </div>,
          document.body
        )}
    </div>
  )
})

export default Table
