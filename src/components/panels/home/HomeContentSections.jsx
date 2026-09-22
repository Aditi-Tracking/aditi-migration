import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../../context/AuthContext'
import {
  accentHex,
  deactivateSection,
  fetchEmployeeDirectory,
  fetchItemsForSections,
  fetchSections,
  removeItem,
  renameSection,
} from '../../../lib/homeContent'
import AddCardPicker from './AddCardPicker'
import AddSectionForm from './AddSectionForm'

// Ported from old-portal/js/homeContent.js — HR-editable card-grid boxes on
// the Home page (Spotlight of the Month, New Joiners, etc.). Everyone sees
// the same read-only boxes; home_content_manage unlocks inline edit
// affordances (rename/deactivate section, add/remove card, add section) —
// there's no separate admin page, same as the original.
export default function HomeContentSections() {
  const { currentUser, permissions } = useAuth()
  const canManage = !!currentUser && permissions.home_content_manage === 'true'

  const [sections, setSections] = useState([])
  const [itemsBySection, setItemsBySection] = useState({})
  const [loading, setLoading] = useState(true)
  const [empDirectory, setEmpDirectory] = useState(null) // null = not loaded yet

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const secs = await fetchSections()
      const items = await fetchItemsForSections(secs.map((s) => s.id))
      const bySection = {}
      items.forEach((it) => {
        ;(bySection[it.section_id] = bySection[it.section_id] || []).push(it)
      })
      setSections(secs)
      setItemsBySection(bySection)
    } catch {
      setSections([])
      setItemsBySection({})
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-time fetch
    load()
  }, [load])

  useEffect(() => {
    if (!canManage || empDirectory !== null) return
    // Warm the employee directory cache in the background for manage users,
    // same as old-portal's _hcEnsureEmpDirectoryLoaded.
    fetchEmployeeDirectory().then(setEmpDirectory)
  }, [canManage, empDirectory])

  const myEmail = (currentUser?.email || '').trim().toLowerCase()

  if (loading) return null // matches old-portal — no loading skeleton for this section
  if (!sections.length && !canManage) return null

  return (
    <div className="mb-5 flex flex-col gap-4">
      {sections.map((sec) => (
        <SectionBox
          key={sec.id}
          section={sec}
          items={itemsBySection[sec.id] || []}
          canManage={canManage}
          empDirectory={empDirectory}
          myEmail={myEmail}
          onChanged={load}
        />
      ))}
      {canManage && (
        <AddSectionForm
          nextOrder={sections.length ? Math.max(...sections.map((s) => s.display_order || 0)) + 1 : 0}
          myEmail={myEmail}
          onCreated={load}
        />
      )}
    </div>
  )
}

function SectionBox({ section, items, canManage, empDirectory, myEmail, onChanged }) {
  const hex = accentHex(section.accent_color)
  const icon = section.icon || '⭐'
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(section.title)
  const [confirmingDeactivate, setConfirmingDeactivate] = useState(false)
  const [pendingRemoveId, setPendingRemoveId] = useState(null)
  const [addOpen, setAddOpen] = useState(false)

  async function saveRename() {
    const title = renameValue.trim()
    if (!title) {
      alert('❌ Title cannot be empty.')
      return
    }
    try {
      await renameSection(section.id, title)
      setRenaming(false)
      onChanged()
    } catch (e) {
      alert('❌ Rename failed: ' + e.message)
    }
  }

  async function confirmDeactivate() {
    try {
      await deactivateSection(section.id)
      onChanged()
    } catch (e) {
      alert('❌ Deactivate failed: ' + e.message)
    }
  }

  async function confirmRemove(itemId) {
    try {
      await removeItem(itemId)
      setPendingRemoveId(null)
      onChanged()
    } catch (e) {
      alert('❌ Remove failed: ' + e.message)
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: hex }} />
      <div className="flex items-center gap-2 mb-3.5">
        <span className="text-[20px]">{icon}</span>
        {renaming ? (
          <>
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className="text-[15.5px] font-bold text-text bg-surface-2 border border-border rounded px-2 py-1"
            />
            <button type="button" onClick={saveRename} className="text-text-muted">
              ✓
            </button>
            <button
              type="button"
              onClick={() => {
                setRenaming(false)
                setRenameValue(section.title)
              }}
              className="text-text-muted"
            >
              ✕
            </button>
          </>
        ) : (
          <>
            <span className="text-[15.5px] font-bold text-text">{section.title}</span>
            {canManage && (
              <button type="button" onClick={() => setRenaming(true)} title="Rename section" className="text-text-muted">
                ✏️
              </button>
            )}
          </>
        )}
        {canManage &&
          (confirmingDeactivate ? (
            <span className="ml-auto flex items-center gap-1.5 text-[13px] text-text-muted whitespace-nowrap">
              Deactivate section?
              <button type="button" onClick={confirmDeactivate} className="rounded border border-border px-2 py-0.5 text-danger">
                Yes
              </button>
              <button type="button" onClick={() => setConfirmingDeactivate(false)} className="rounded border border-border px-2 py-0.5">
                No
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingDeactivate(true)}
              title="Deactivate section"
              className="ml-auto text-text-muted"
            >
              🗑️
            </button>
          ))}
      </div>

      <div className="flex flex-wrap gap-3.5 justify-center">
        {items.length === 0 && !canManage && <div className="text-text-muted text-[14px] py-2.5">No entries yet.</div>}
        {items.map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            hex={hex}
            canManage={canManage}
            pendingRemove={pendingRemoveId === item.id}
            onStartRemove={() => setPendingRemoveId(item.id)}
            onCancelRemove={() => setPendingRemoveId(null)}
            onConfirmRemove={() => confirmRemove(item.id)}
          />
        ))}
        {canManage && (
          <AddCardPicker
            open={addOpen}
            onOpen={() => setAddOpen(true)}
            onClose={() => setAddOpen(false)}
            sectionId={section.id}
            empDirectory={empDirectory}
            existingNames={items.map((it) => (it.employee_name || '').trim().toLowerCase())}
            nextOrder={items.length ? Math.max(...items.map((i) => i.display_order || 0)) + 1 : 0}
            myEmail={myEmail}
            onAdded={onChanged}
          />
        )}
      </div>
    </div>
  )
}

function ItemCard({ item, hex, canManage, pendingRemove, onStartRemove, onCancelRemove, onConfirmRemove }) {
  const [photoError, setPhotoError] = useState(false)
  const initial = (item.employee_name || '?').trim()[0]?.toUpperCase()

  return (
    <div className="relative w-[190px] rounded-xl border border-border bg-surface-2 overflow-hidden">
      <div className="h-1" style={{ background: hex, opacity: 0.8 }} />
      {canManage &&
        (pendingRemove ? (
          <div className="absolute inset-0 bg-surface flex flex-col items-center justify-center gap-2 p-2.5 z-10">
            <div className="text-[13px] text-text-muted text-center">Remove this card?</div>
            <div className="flex gap-2">
              <button type="button" onClick={onConfirmRemove} className="rounded border border-border px-2.5 py-1 text-[13px] text-danger">
                Yes
              </button>
              <button type="button" onClick={onCancelRemove} className="rounded border border-border px-2.5 py-1 text-[13px]">
                No
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={onStartRemove}
            title="Remove card"
            className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-black/35 text-white text-[12px] z-10"
          >
            ✕
          </button>
        ))}
      <div className="p-3.5 flex flex-col items-center text-center">
        {item.photo_url && !photoError ? (
          <img
            src={item.photo_url}
            alt={item.employee_name}
            className="w-14 h-14 rounded-full object-cover mb-2"
            onError={() => setPhotoError(true)}
          />
        ) : (
          <div className="w-14 h-14 rounded-full bg-primary-tint text-primary flex items-center justify-center text-[20px] font-bold mb-2">
            {initial}
          </div>
        )}
        <div className="text-[14.5px] font-semibold text-text">{item.employee_name}</div>
        {item.subtitle && (
          <div
            className="text-[12.5px] font-semibold rounded-full px-2 py-0.5 mt-1.5"
            style={{ background: hex + '1f', color: hex, border: `1px solid ${hex}4d` }}
          >
            🏢 {item.subtitle}
          </div>
        )}
        {item.location && <div className="text-[12.5px] text-text-muted mt-1">📍 {item.location}</div>}
        {item.extra_label && (
          <div
            className="text-[12px] font-bold rounded-full px-2 py-0.5 mt-1.5"
            style={{ color: hex, background: hex + '1a', border: `1px solid ${hex}40` }}
          >
            {item.extra_label}
          </div>
        )}
      </div>
    </div>
  )
}
