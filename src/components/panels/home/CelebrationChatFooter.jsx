import { useRef, useState } from 'react'
import { EMOJI_LIST } from '../../../lib/announcementsCelebChat'

// Ported from announcements.js's annToggleEmojiPicker/annInsertEmoji/
// annSendChatWish's input handling + _annSetSelfAvatar.
export default function CelebrationChatFooter({ currentUser, onSend, sending }) {
  const [text, setText] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  function insertEmoji(emoji) {
    const input = inputRef.current
    const pos = input?.selectionStart ?? text.length
    const next = text.slice(0, pos) + emoji + text.slice(pos)
    setText(next)
    requestAnimationFrame(() => {
      input?.focus()
      input?.setSelectionRange(pos + emoji.length, pos + emoji.length)
    })
  }

  async function handleSend() {
    const msg = text.trim()
    if (!msg || sending) return
    setText('')
    setPickerOpen(false)
    setError('')
    try {
      await onSend(msg)
    } catch (e) {
      setText(msg) // restore on failure, matches production
      setError('⚠️ Could not send: ' + (e.message || 'please try again'))
      setTimeout(() => setError(''), 4000)
    }
  }

  const initial = (currentUser?.name || currentUser?.email || '?')[0]?.toUpperCase()

  return (
    <div className="border-t border-border shrink-0 bg-surface">
      {pickerOpen && (
        <div className="border-b border-border px-3 py-2 max-h-[110px] overflow-y-auto">
          <div className="flex flex-wrap gap-0.5">
            {EMOJI_LIST.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => insertEmoji(e)}
                className="text-[22px] p-1 rounded hover:bg-surface-2"
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <div className="px-4 pt-2 text-[13px] text-danger">{error}</div>}

      <div className="flex items-center gap-2 px-3 py-2.5">
        {currentUser?.avatar_url ? (
          <img src={currentUser.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
        ) : (
          <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-[14px] font-extrabold shrink-0">
            {initial}
          </div>
        )}
        <button
          type="button"
          onClick={() => setPickerOpen((o) => !o)}
          title="Emojis"
          className="w-8 h-8 rounded-full border border-primary/30 bg-primary-tint flex items-center justify-center text-[17px] shrink-0"
        >
          😊
        </button>
        <div className="flex-1 flex items-center bg-surface-2 border border-border rounded-full px-3.5 py-1.5">
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder="Send a wish… 🎉"
            maxLength={300}
            className="flex-1 bg-transparent outline-none text-[15px] text-text"
          />
        </div>
        <button
          type="button"
          onClick={handleSend}
          disabled={sending || !text.trim()}
          className="w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center shrink-0 disabled:opacity-50"
        >
          ➤
        </button>
      </div>
    </div>
  )
}
