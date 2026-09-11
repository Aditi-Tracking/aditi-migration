import { useEffect, useState } from 'react'
import { useCelebrations } from '../../../context/CelebrationsContext'
import { fmtTime, saveReply, saveReplyToAll } from '../../../lib/celebrations'
import OverlayShell from '../../shared/OverlayShell'

// Ported from old-portal/js/celebrations.js's _openMyWishesModal/
// _renderMyWishes/_sendReply/_sendReplyToEveryone. Global overlay, same
// placement reasoning as CelebrationWishPopup.
export default function MyWishesModal() {
  const { myWishesOpen, closeMyWishesModal, selfWishData, refreshSelfWishCount } = useCelebrations()

  const [loading, setLoading] = useState(false)
  const [localWishes, setLocalWishes] = useState([])
  const [replyAllOpen, setReplyAllOpen] = useState(false)
  const [replyAllText, setReplyAllText] = useState('')
  const [replyAllSending, setReplyAllSending] = useState(false)
  const [replyAllDone, setReplyAllDone] = useState(false)
  const [openReplyId, setOpenReplyId] = useState(null)
  const [replyDrafts, setReplyDrafts] = useState({})
  const [savingReplyId, setSavingReplyId] = useState(null)

  useEffect(() => {
    if (!myWishesOpen) return
    // Reset fresh each time the modal opens — it stays mounted between opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReplyAllOpen(false)
    setReplyAllText('')
    setReplyAllDone(false)
    setOpenReplyId(null)
    setReplyDrafts({})

    if (selfWishData.wishes !== null) {
      // Reuse the already-preloaded count, no refetch needed.
      setLocalWishes(selfWishData.wishes)
      setLoading(false)
      return
    }
    setLoading(true)
    setLocalWishes([])
    refreshSelfWishCount(selfWishData.email, selfWishData.type, selfWishData.empId).then((w) => {
      setLocalWishes(w)
      setLoading(false)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when the modal opens
  }, [myWishesOpen])

  async function handleSaveReply(wishId) {
    const text = (replyDrafts[wishId] || '').trim()
    if (!text) return
    setSavingReplyId(wishId)
    try {
      await saveReply(wishId, text)
      setLocalWishes((prev) => prev.map((w) => (w.id === wishId ? { ...w, reply_text: text } : w)))
      setOpenReplyId(null)
    } catch {
      alert('Could not save reply. Please try again.')
    } finally {
      setSavingReplyId(null)
    }
  }

  async function handleSendReplyAll() {
    const text = replyAllText.trim()
    if (!text || !localWishes.length) return
    setReplyAllSending(true)
    try {
      const successCount = await saveReplyToAll(localWishes, text)
      if (successCount > 0) {
        setLocalWishes((prev) => prev.map((w) => ({ ...w, reply_text: text })))
        setReplyAllDone(true)
        setReplyAllText('')
        setTimeout(() => {
          setReplyAllOpen(false)
          setReplyAllDone(false)
        }, 2500)
      } else {
        alert('Could not send replies. Please try again.')
      }
    } finally {
      setReplyAllSending(false)
    }
  }

  if (!myWishesOpen) return null

  const typeLabel = selfWishData.type === 'anniversary' ? 'Work Anniversary' : 'Birthday'

  return (
    <OverlayShell open={myWishesOpen} onClose={closeMyWishesModal} maxWidth="max-w-lg">
      <div className="pr-8">
        <div className="text-[15px] font-semibold text-text">🎁 Your Wishes</div>
        <div className="text-[11.5px] text-text-muted mt-0.5">Wishes received on your {typeLabel} today</div>
      </div>

      {loading && <div className="text-center py-10 text-text-muted text-[12.5px]">Loading…</div>}

      {!loading && !localWishes.length && (
        <div className="text-center py-10 text-text-muted text-[12.5px]">No wishes yet — check back later! 🎈</div>
      )}

      {!loading && !!localWishes.length && (
        <>
          <div className="flex items-center justify-between mt-4 mb-2.5">
            <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wide">
              {localWishes.length} wish{localWishes.length === 1 ? '' : 'es'}
            </span>
            <button
              type="button"
              onClick={() => setReplyAllOpen((o) => !o)}
              className="text-[11.5px] font-medium text-primary bg-primary-tint border border-primary/20 rounded-md px-2.5 py-1"
            >
              💬 Reply to Everyone
            </button>
          </div>

          {replyAllOpen && (
            <div className="rounded-lg border border-border bg-surface-2 p-3 mb-3">
              {replyAllDone ? (
                <div className="text-[12px] text-primary font-medium text-center py-1.5">✅ Sent to everyone!</div>
              ) : (
                <>
                  <textarea
                    value={replyAllText}
                    onChange={(e) => setReplyAllText(e.target.value.slice(0, 200))}
                    placeholder="Write a reply to send to everyone who wished you..."
                    rows={3}
                    className="w-full rounded-md border border-border bg-surface px-3 py-2 text-[12.5px] text-text outline-none resize-none"
                  />
                  <button
                    type="button"
                    onClick={handleSendReplyAll}
                    disabled={replyAllSending}
                    className="w-full mt-2 rounded-md bg-primary text-white text-[12.5px] font-semibold py-2 disabled:opacity-60"
                  >
                    {replyAllSending ? 'Sending...' : 'Send to All 💌'}
                  </button>
                </>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2.5 max-h-[50vh] overflow-y-auto">
            {localWishes.map((w) => {
              const fromEmpData = w.from_employee || {}
              const fromName = fromEmpData.Employee_name || w.from_name || 'Colleague'
              const fromDept = fromEmpData.Employee_Dept || ''
              const fromAvatar = fromEmpData.avatar_url || fromEmpData.Link || null
              const timeStr = w.created_at ? fmtTime(w.created_at) : ''
              const hasReply = !!w.reply_text
              const isReplyOpen = openReplyId === w.id

              return (
                <div key={w.id} className="rounded-xl border border-border bg-surface-2 p-3">
                  <div className="flex gap-2.5 items-start">
                    {fromAvatar ? (
                      <img src={fromAvatar} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-primary-tint border border-primary/20 text-primary flex items-center justify-center text-[12px] font-bold shrink-0">
                        {(fromName[0] || '?').toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                        <span className="text-[12.5px] font-semibold text-text">{fromName}</span>
                        {fromDept && (
                          <span className="text-[10px] text-text-muted bg-surface border border-border rounded-full px-1.5 py-0.5">
                            {fromDept}
                          </span>
                        )}
                        {timeStr && <span className="text-[10px] text-text-muted ml-auto whitespace-nowrap">{timeStr}</span>}
                      </div>
                      <div className="text-[12.5px] text-text-muted leading-relaxed break-words">{w.wish_text || '🎉'}</div>

                      {hasReply && (
                        <div className="mt-2 rounded-r-lg border-l-2 border-primary bg-primary-tint px-3 py-2">
                          <div className="text-[10px] font-semibold text-primary mb-0.5">🎂 Your Reply</div>
                          <div className="text-[12px] text-text">{w.reply_text}</div>
                        </div>
                      )}

                      {!hasReply && !isReplyOpen && (
                        <button
                          type="button"
                          onClick={() => setOpenReplyId(w.id)}
                          className="mt-1.5 text-[11px] font-medium text-primary bg-primary-tint border border-primary/20 rounded-full px-2.5 py-1"
                        >
                          💬 Reply
                        </button>
                      )}

                      {!hasReply && isReplyOpen && (
                        <div className="mt-1.5">
                          <textarea
                            value={replyDrafts[w.id] || ''}
                            onChange={(e) => setReplyDrafts((d) => ({ ...d, [w.id]: e.target.value.slice(0, 200) }))}
                            placeholder="Write your reply..."
                            rows={2}
                            className="w-full rounded-md border border-border bg-surface px-2.5 py-2 text-[12px] text-text outline-none resize-none"
                          />
                          <div className="flex gap-2 mt-1.5">
                            <button
                              type="button"
                              onClick={() => handleSaveReply(w.id)}
                              disabled={savingReplyId === w.id}
                              className="flex-1 rounded-md bg-primary text-white text-[11.5px] font-semibold py-1.5 disabled:opacity-60"
                            >
                              Send Reply 💬
                            </button>
                            <button
                              type="button"
                              onClick={() => setOpenReplyId(null)}
                              className="rounded-md border border-border bg-surface text-text-muted text-[11.5px] px-3 py-1.5"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </OverlayShell>
  )
}
