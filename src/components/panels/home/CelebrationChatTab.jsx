import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../../context/AuthContext'
import { useCelebrations } from '../../../context/CelebrationsContext'
import { fetchAvatarsForEmails, fetchNewWishesSince, fetchTodaysWishes, sendChatWish } from '../../../lib/announcementsCelebChat'
import { ordinal } from '../../../lib/celebrations'
import CelebrationChatFooter from './CelebrationChatFooter'

// Ported from announcements.js's _annDrwFetchWishes/_annDrwRender's celeb
// branch/annSendChatWish/_annStartChatPoll. The parent (AnnouncementsDrawer)
// only renders this component while the drawer is open AND this is the
// active tab, so its own mount/unmount lifecycle is what starts and stops
// the 5s poll — no separate "is this visible" flag needed here.
//
// Reuses Phase 1's already-fetched celebration list (useCelebrations())
// instead of a third redundant Employee_details fetch — same underlying
// data production computes independently for this tab.
export default function CelebrationChatTab() {
  const { currentUser } = useAuth()
  const { birthdays, anniversaries, empList } = useCelebrations()
  const [wishes, setWishes] = useState([])
  const [loading, setLoading] = useState(true)
  const [avatars, setAvatars] = useState({})
  const [sending, setSending] = useState(false)
  const feedRef = useRef(null)
  const lastIdRef = useRef(0)

  useEffect(() => {
    let cancelled = false
    fetchTodaysWishes().then((rows) => {
      if (cancelled) return
      setWishes(rows)
      lastIdRef.current = rows.length ? Math.max(...rows.map((w) => w.id || 0)) : 0
      setLoading(false)
      const emails = [...new Set(rows.map((w) => w.from_email).filter(Boolean))]
      fetchAvatarsForEmails(emails).then((map) => {
        if (!cancelled) setAvatars((prev) => ({ ...prev, ...map }))
      })
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const interval = setInterval(async () => {
      const newMsgs = await fetchNewWishesSince(lastIdRef.current)
      if (!newMsgs.length) return
      let added = []
      setWishes((prev) => {
        const existingIds = new Set(prev.map((w) => w.id))
        added = newMsgs.filter((w) => !existingIds.has(w.id))
        return added.length ? [...prev, ...added] : prev
      })
      if (!added.length) return
      lastIdRef.current = Math.max(lastIdRef.current, ...added.map((w) => w.id || 0))
      const emails = [...new Set(added.map((w) => w.from_email).filter(Boolean))]
      fetchAvatarsForEmails(emails).then((map) => {
        if (Object.keys(map).length) setAvatars((prev) => ({ ...prev, ...map }))
      })
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const feed = feedRef.current
    if (feed) feed.scrollTop = feed.scrollHeight
  }, [wishes])

  const celebs = [
    ...birthdays.map((p) => ({ ...p, celebType: 'birthday' })),
    ...anniversaries.map((p) => ({ ...p, celebType: 'anniversary' })),
  ]

  async function handleSend(message) {
    setSending(true)
    try {
      const localMsg = await sendChatWish({ currentUser, target: celebs[0] || null, message, empList })
      setWishes((prev) => [...prev, localMsg])
      lastIdRef.current = Math.max(lastIdRef.current, localMsg.id || 0)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div ref={feedRef} className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-2.5">
        {loading && <div className="text-center py-10 text-text-muted text-[14.5px]">⏳ Loading…</div>}

        {!loading && !!celebs.length && (
          <div className="rounded-xl border border-primary/25 bg-surface-2 p-3.5 mb-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[20px]">{birthdays.length && anniversaries.length ? '🎉' : birthdays.length ? '🎂' : '🥳'}</span>
              <span className="text-[12.5px] font-bold text-primary bg-primary-tint border border-primary/20 rounded-full px-2 py-0.5">
                Celebrations
              </span>
              <span className="text-[12.5px] font-bold text-danger ml-auto">🔴 Today</span>
            </div>
            <div className="text-[15px] font-bold text-text mb-2.5">
              {birthdays.length && anniversaries.length
                ? 'Birthdays & Anniversaries Today!'
                : birthdays.length === 1
                  ? `Happy Birthday, ${birthdays[0].name.split(' ')[0]}! 🎂`
                  : birthdays.length > 1
                    ? `${birthdays.length} Birthdays Today!`
                    : anniversaries.length === 1
                      ? `Happy Anniversary, ${anniversaries[0].name.split(' ')[0]}! 🥳`
                      : `${anniversaries.length} Work Anniversaries!`}
            </div>
            <div className="flex flex-wrap gap-2 mb-2.5">
              {celebs.map((p) => (
                <div
                  key={`${p.celebType}-${p.email || p.name}`}
                  className="flex items-center gap-1.5 rounded-lg bg-primary-tint border border-primary/20 px-2.5 py-1.5"
                >
                  {p.avatar ? (
                    <img src={p.avatar} alt="" className="w-6 h-6 rounded-full object-cover" />
                  ) : (
                    <span className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-[12px] font-extrabold">
                      {(p.name || '?')[0].toUpperCase()}
                    </span>
                  )}
                  <div>
                    <div className="text-[13.5px] font-bold text-text">
                      {p.celebType === 'birthday' ? '🎂' : '🥳'} {p.name.split(' ')[0]}
                    </div>
                    <div className="text-[12px] text-text-muted">
                      {p.celebType === 'birthday' ? 'Birthday' : `${p.years ? ordinal(p.years) + ' ' : ''}Anniversary`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="text-[13.5px] text-text-muted">Spread some love and wish your teammates on their special day! 💛</div>
          </div>
        )}

        {!loading && (
          <div className="text-center mb-1">
            <span className="text-[12px] font-bold text-text-muted bg-primary-tint border border-primary/20 rounded-full px-3 py-1 tracking-wide inline-flex items-center gap-1.5">
              ✨ GROUP WISHES ✨ <span className="w-1.5 h-1.5 rounded-full bg-primary" title="Live" />
            </span>
          </div>
        )}

        {!loading && !wishes.length && (
          <div className="text-center py-8">
            <div className="text-[42px] mb-2">🎊</div>
            <div className="text-[15px] font-bold text-text mb-1">No messages yet!</div>
            <div className="text-[14px] text-text-muted">Be the first to spread some joy 🌟</div>
          </div>
        )}

        {!loading &&
          wishes.map((w) => {
            const isMe = currentUser?.email && w.from_email && w.from_email.toLowerCase() === currentUser.email.toLowerCase()
            const sender = w.from_name || (w.from_email ? w.from_email.split('@')[0] : 'Someone')
            const avatar = avatars[(w.from_email || '').toLowerCase()] || null
            const timeStr = w.created_at
              ? new Date(w.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
              : ''
            const target = celebs.find((c) => c.email === w.to_email)
            const toName = target ? target.name.split(' ')[0] : w.to_name && w.to_name !== 'Team' ? w.to_name.split(' ')[0] : ''
            const typeEmoji = w.type === 'birthday' ? '🎂' : w.type === 'anniversary' ? '🥳' : '🎉'

            return (
              <div key={w.id} className={`flex ${isMe ? 'justify-end' : 'items-start gap-2'}`}>
                {!isMe &&
                  (avatar ? (
                    <img src={avatar} alt="" className="w-8 h-8 rounded-full object-cover shrink-0 mt-0.5" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-primary-tint border border-primary/25 text-primary flex items-center justify-center text-[13px] font-extrabold shrink-0 mt-0.5">
                      {(sender[0] || '?').toUpperCase()}
                    </div>
                  ))}
                <div className="max-w-[80%]">
                  {!isMe && <div className="text-[12.5px] font-bold text-primary mb-1">{sender}</div>}
                  <div
                    className={`rounded-2xl px-3.5 py-2.5 ${
                      isMe ? 'bg-primary text-white rounded-tr-sm' : 'bg-surface-2 border border-border rounded-tl-sm'
                    }`}
                  >
                    {toName && (
                      <div className={`text-[12.5px] font-bold mb-1 ${isMe ? 'text-white/85' : 'text-primary'}`}>
                        {typeEmoji} To {toName}
                      </div>
                    )}
                    <div className={`text-[15px] leading-relaxed ${isMe ? 'text-white' : 'text-text'}`}>{w.wish_text}</div>
                    <div className={`text-[12px] mt-1 ${isMe ? 'text-white/70 text-right' : 'text-text-muted'}`}>
                      {timeStr}
                      {isMe ? ' ✓✓' : ''}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
      </div>

      <CelebrationChatFooter currentUser={currentUser} onSend={handleSend} sending={sending} />
    </div>
  )
}
