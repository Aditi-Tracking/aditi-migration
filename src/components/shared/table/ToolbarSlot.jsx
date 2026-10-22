// A toolbar control that is only sometimes relevant (Clear filters, Clear selection, Send / Push N) keeps its place: it is
// rendered INVISIBLE (visibility: hidden — so neither focusable nor clickable) in a fixed-width slot instead of being
// removed, so its appearing or disappearing never shifts a neighbour. `width` is a literal Tailwind class (w-[104px]);
// make the child fill it (w-full) so a label that changes length ("Push 2" -> "Push 45") cannot resize the slot.
export default function ToolbarSlot({ show, width, children }) {
  return (
    <span className={`inline-flex shrink-0 ${width} ${show ? '' : 'invisible'}`} aria-hidden={!show}>
      {children}
    </span>
  )
}
