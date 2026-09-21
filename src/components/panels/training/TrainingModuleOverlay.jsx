import OverlayShell from '../../shared/OverlayShell'
import CNCategoryBrowser from '../../shared/CNCategoryBrowser'

// Ported from old-portal's shared marketingOverlay. Previously also owned a Videos/Assessment
// tab bar for the now-removed quiz subsystem (a deliberate product decision, not a port gap —
// see MIGRATION-NOTES.md) — collapsed back to rendering CNCategoryBrowser directly, matching
// every other module's overlay (Products/Marketing/IT Admin never showed the tab bar to begin
// with, since Training was the only module production actually rendered it for).
export default function TrainingModuleOverlay({ open, node, canDelete, onContentChanged, onClose }) {
  if (!open || !node) return null

  return (
    <OverlayShell open={open} onClose={onClose} maxWidth="max-w-5xl" height="h-[640px]">
      <div className="text-[15px] font-semibold text-text mb-3 pr-8">{node.name}</div>
      <CNCategoryBrowser rootNodeId={node.id} rootName={node.name} canDelete={canDelete} onContentChanged={onContentChanged} />
    </OverlayShell>
  )
}
