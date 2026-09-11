import { useEffect, useState } from 'react'
import { useAuth } from '../../../context/AuthContext'
import { deletePortalUpdate, formatTimeLabel, safeBody } from '../../../lib/announcements'
import PostUpdateModal from './PostUpdateModal'

// Ported from old-portal/js/announcements.js's openAnnOverlay/_annDrwRender —
// Updates tab only for now (see MIGRATION-NOTES.md: Celebrations tab is a
// separate, deferred module). No tab bar since there's only one tab.
export default function AnnouncementsDrawer({ open, updates, loading, error, onClose, onRefetch }) {
  const { currentUser, permissions } = useAuth()
  const canPost = permissions.can_post_announcements === 'true'
  // Delete is intentionally a stricter, separate check from can_post_announcements —
  // matches old-portal/js/announcements.js's deletePortalUpdate exactly.
  const canDelete = currentUser?.rawRole === 'mis'

  const [postModalOpen, setPostModalOpen] = useState(false)
  const [editingUpdate, setEditingUpdate] = useState(null)

  useEffect(() => {
    if (!open) return
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  async function handleDelete(id) {
    if (!confirm('Are you sure you want to delete this update?')) return
    try {
      await deletePortalUpdate(id)
      onRefetch()
    } catch (e) {
      alert('Delete error: ' + (e.message || 'Please try again.'))
    }
  }

  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 z-[200] bg-black/50 transition-opacity ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      />
      <div
        className={`fixed top-0 right-0 bottom-0 z-[201] w-full max-w-md bg-surface border-l border-border flex flex-col transition-transform duration-300 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-5 h-14 border-b border-border shrink-0">
          <span className="text-[14px] font-semibold text-text">📢 Announcements</span>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-surface-2 border border-border text-text-muted flex items-center justify-center"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && <div className="text-center py-16 text-text-muted text-[12.5px]">⏳ Loading...</div>}
          {!loading && error && <div className="text-center py-16 text-danger text-[12.5px]">⚠️ {error}</div>}
          {!loading && !error && !updates.length && (
            <div className="text-center py-16 text-text-muted">
              <div className="text-[13px] font-medium text-text mb-1">No portal updates yet.</div>
              <div className="text-[12px]">MIS Team will post updates here soon.</div>
            </div>
          )}
          {!loading && !error && (
            <div className="flex flex-col gap-3">
              {updates.map((u) => (
                <div key={u.id} className="rounded-xl border border-border border-l-[3px] border-l-primary bg-surface-2 p-3.5">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full bg-primary-tint text-primary border border-primary/20">
                      Portal Update
                    </span>
                    <span className="text-[10.5px] text-text-muted ml-auto">{formatTimeLabel(u.created_at)}</span>
                    {canPost && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingUpdate(u)
                          setPostModalOpen(true)
                        }}
                        className="text-[10.5px] font-medium text-primary bg-primary-tint border border-primary/20 rounded px-2 py-0.5"
                      >
                        ✏️ Edit
                      </button>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => handleDelete(u.id)}
                        className="text-[10.5px] font-medium text-danger bg-danger-tint border border-danger/20 rounded px-2 py-0.5"
                      >
                        🗑 Delete
                      </button>
                    )}
                  </div>
                  <div className="text-[13.5px] font-semibold text-text mb-1.5">{u.title}</div>
                  <div
                    className="text-[12.5px] text-text-muted leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: safeBody(u.body) }}
                  />
                  {u.posted_by && (
                    <div className="mt-2.5 pt-2.5 border-t border-border text-[11px] text-text-muted flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded bg-primary-tint text-primary flex items-center justify-center text-[10px] font-bold">
                        {(u.posted_by || 'M')[0].toUpperCase()}
                      </span>
                      Posted by <strong className="text-text-muted">{u.posted_by}</strong>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {canPost && (
          <div className="px-5 py-3.5 border-t border-border shrink-0">
            <button
              type="button"
              onClick={() => {
                setEditingUpdate(null)
                setPostModalOpen(true)
              }}
              className="w-full rounded-md bg-primary text-white text-[12.5px] font-medium py-2.5"
            >
              ✨ Post Update
            </button>
          </div>
        )}
      </div>

      <PostUpdateModal
        open={postModalOpen}
        editingUpdate={editingUpdate}
        onClose={() => setPostModalOpen(false)}
        onSaved={onRefetch}
      />
    </>
  )
}
