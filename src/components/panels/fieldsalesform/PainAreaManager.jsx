import { addPainArea, renamePainArea, setPainAreaActive } from '../../../lib/fieldSalesVisits'
import ManageListPopover from '../../shared/ManageListPopover'

// The admin's editor for the one managed list of the Visit Form: Pain area. Add / Remove (retire) / Restore go through the options table's own policies, Rename
// through rename_dropdown_option (it also renames the pain area of every lead that holds the old name). Opened from the Manage link beside the field in the form and
// from the leads list's toolbar; both pass the same list. It never fetches: `onChanged()` (force refetch, resolves) refreshes whoever owns the list.
// Props: anchorRef, open, onClose, items ([{ id, value, is_active }]), onChanged(), onRetired?(value), onRenamed?(oldName, newName).
export default function PainAreaManager({ anchorRef, open, onClose, items, onChanged, onRetired, onRenamed }) {
  async function add(value) {
    await addPainArea(value)
    await onChanged()
  }
  async function setActive(item, active) {
    await setPainAreaActive(item.id, active)
    if (!active) onRetired?.(item.value)
    await onChanged()
  }
  async function rename(item, name) {
    const out = await renamePainArea(item.id, name)
    onRenamed?.(item.value, out.new)
    await onChanged()
  }
  return <ManageListPopover anchorRef={anchorRef} open={open} onClose={onClose} label="Pain area" items={items || []} onAdd={add} onSetActive={setActive} onRename={rename} width={340} />
}
