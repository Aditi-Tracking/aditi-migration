import { useEffect, useState } from 'react'
import { useAuth } from '../../../context/AuthContext'
import { useCelebrations } from '../../../context/CelebrationsContext'
import { fetchReplyForWish, hasAlreadyWished, isMe, ordinal } from '../../../lib/celebrations'

// Ported from old-portal/js/celebrations.js's _renderCelebBanner/
// _updateBannerWishButton/_checkAndShowReplyOnHome. Home-scoped (unlike
// the popup/modal, which are global) — matches #celebrationHomeBanner/
// #celebReplyNotif both living inside #panel-home in production.
export default function CelebrationBanner() {
  const { currentUser } = useAuth()
  const { birthdays, anniversaries, empList, loading, openWishPopup, openMyWishesModal, refreshSelfWishCount, selfWishData } =
    useCelebrations()

  const [wishBtnState, setWishBtnState] = useState('checking') // 'checking' | 'wished' | 'unwished'
  const [replyNotif, setReplyNotif] = useState(null)

  const hasBday = birthdays.length > 0
  const hasAnni = anniversaries.length > 0
  const iAmBdayCelebrant = birthdays.some((p) => isMe(p, currentUser))
  const iAmAnniCelebrant = anniversaries.some((p) => isMe(p, currentUser))
  const iAmCelebrant = iAmBdayCelebrant || iAmAnniCelebrant

  useEffect(() => {
    if (loading || (!hasBday && !hasAnni)) return

    if (iAmCelebrant) {
      const me = birthdays.find((p) => isMe(p, currentUser)) || anniversaries.find((p) => isMe(p, currentUser))
      refreshSelfWishCount(me.email || currentUser?.email, iAmBdayCelebrant ? 'birthday' : 'anniversary', me.empId || null)
      return
    }

    let cancelled = false
    const allCelebs = [
      ...birthdays.map((p) => ({ ...p, celebType: 'birthday' })),
      ...anniversaries.map((p) => ({ ...p, celebType: 'anniversary' })),
    ]

    Promise.all(allCelebs.map((p) => hasAlreadyWished(currentUser, p, p.celebType, empList))).then((results) => {
      if (cancelled) return
      setWishBtnState(results.every(Boolean) ? 'wished' : 'unwished')
    })
    ;(async () => {
      for (const person of allCelebs) {
        const already = await hasAlreadyWished(currentUser, person, person.celebType, empList)
        if (!already) continue
        const reply = await fetchReplyForWish(currentUser, person, person.celebType, empList)
        if (cancelled) return
        if (reply && reply.reply_text) {
          setReplyNotif({
            firstName: (person.name || '').split(' ')[0],
            typeIcon: person.celebType === 'birthday' ? '🎂' : '🥳',
            wishText: reply.wish_text,
            replyText: reply.reply_text,
          })
          break // show one at a time, matches production
        }
      }
    })()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the day's celebrant list resolves
  }, [loading, birthdays, anniversaries, iAmCelebrant])

  if (loading || (!hasBday && !hasAnni)) return null

  let mainEmoji, title, subText
  if (iAmCelebrant) {
    mainEmoji = iAmBdayCelebrant ? '🎂' : '🥳'
    title = iAmBdayCelebrant ? "It's Your Birthday Today!" : "It's Your Work Anniversary Today!"
    subText = iAmBdayCelebrant
      ? 'Wishing you a day full of joy and celebration! The entire Aditi Tracking family is thinking of you. 🎊'
      : 'Congratulations on your work anniversary! Your journey inspires us all. 🚀'
  } else if (hasBday && hasAnni) {
    mainEmoji = '🎉'
    title = 'Birthdays & Anniversaries Today!'
    subText = 'Spread some love — wish your teammates on their special day! 💛'
  } else if (hasBday) {
    mainEmoji = '🎂'
    title = `${birthdays.length === 1 ? birthdays[0].name.split(' ')[0] : birthdays.length + ' teammates'} ${birthdays.length === 1 ? 'has' : 'have'} a Birthday Today!`
    subText = 'Make their day extra special — send your warmest wishes! 🎊'
  } else {
    mainEmoji = '🥳'
    title = `Work Anniversary${anniversaries.length > 1 ? 'ies' : ''} Today!`
    subText = 'Celebrate the journey — wish your colleagues on their work anniversary! ⭐'
  }

  return (
    <>
      <div className="rounded-2xl border border-primary/25 bg-surface p-4 mb-5">
        <div className="flex items-start gap-3.5 flex-wrap">
          <div className="text-[32px] leading-none shrink-0">{mainEmoji}</div>
          <div className="flex-1 min-w-[200px]">
            <div className="text-[14.5px] font-semibold text-text">{title}</div>
            <div className="text-[12px] text-text-muted mt-1">{subText}</div>
            <div className="flex flex-wrap gap-2 mt-3">
              {birthdays.map((p) => (
                <button
                  key={`b-${p.email || p.name}`}
                  type="button"
                  onClick={() => openWishPopup('birthday-others', p, null)}
                  title={`Click to wish ${p.name}`}
                  className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-primary bg-primary-tint border border-primary/20 rounded-full px-2.5 py-1"
                >
                  🎂 {p.name}
                </button>
              ))}
              {anniversaries.map((p) => (
                <button
                  key={`a-${p.email || p.name}`}
                  type="button"
                  onClick={() => openWishPopup('anniversary-others', p, p.years)}
                  title={`Click to wish ${p.name}`}
                  className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-primary bg-primary-tint border border-primary/20 rounded-full px-2.5 py-1"
                >
                  🥳 {p.name} <span className="opacity-70 text-[10.5px]">{ordinal(p.years)} Year</span>
                </button>
              ))}
            </div>
          </div>
          <div className="shrink-0 self-center mr-2">
            {iAmCelebrant ? (
              <button
                type="button"
                onClick={openMyWishesModal}
                className="flex items-center gap-2 text-base font-semibold text-white bg-primary rounded-lg px-5 py-2.5"
              >
                🎁 See Your Wishes
                <span className="bg-white/25 rounded-full px-2 py-0.5 text-[11px] font-bold min-w-[20px] text-center">
                  {selfWishData.wishes ? selfWishData.wishes.length : '...'}
                </span>
              </button>
            ) : wishBtnState === 'checking' ? (
              <button type="button" disabled className="text-base font-medium text-text-muted border border-border rounded-lg px-5 py-2.5 opacity-60">
                ⏳ Checking…
              </button>
            ) : wishBtnState === 'wished' ? (
              <button type="button" disabled className="text-base font-semibold text-primary bg-primary-tint border border-primary/20 rounded-lg px-5 py-2.5">
                ✅ Wished!
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (birthdays.length) openWishPopup('birthday-others', birthdays[0], null)
                  else if (anniversaries.length) openWishPopup('anniversary-others', anniversaries[0], anniversaries[0].years)
                }}
                className="text-base font-semibold text-white bg-primary rounded-lg px-5 py-2.5"
              >
                🎉 Wish Them!
              </button>
            )}
          </div>
        </div>
      </div>

      {replyNotif && (
        <div className="rounded-2xl border border-primary/25 bg-surface p-3.5 mb-5 flex gap-3">
          <div className="text-[22px] shrink-0">{replyNotif.typeIcon}</div>
          <div className="flex-1 min-w-0">
            <div className="text-[10.5px] font-semibold text-primary uppercase tracking-wide mb-1">
              {replyNotif.firstName} replied to your wish!
            </div>
            <div className="text-[11.5px] text-text-muted italic mb-1.5">"{replyNotif.wishText}"</div>
            <div className="rounded-r-md border-l-2 border-primary bg-primary-tint px-3 py-2 text-[12.5px] text-text leading-relaxed">
              {replyNotif.replyText}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
