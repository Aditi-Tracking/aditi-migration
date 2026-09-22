import { useAuth } from '../../../context/AuthContext'
import { useTaskChecklistNav } from '../../../context/TaskChecklistNavContext'
import { isHomeBannerHiddenForRole } from '../../../lib/taskChecklist'

// Ported from old-portal/js/tasks.js's updateHomeTaskBanner(). Data comes
// from TaskChecklistNavContext (shared with the nav-reveal decision, same
// background fetch). Unlike CelebrationBanner (which pops in silently once
// its fetch resolves), this banner distinguishes loading/absent/content
// explicitly, per an explicit request — production's own silent-pop-in
// wasn't asked to be replicated here.
export default function TaskAlertBanner({ onNavigate }) {
  const { currentUser } = useAuth()
  const { loading, bannerSummary } = useTaskChecklistNav()

  if (isHomeBannerHiddenForRole(currentUser)) return null

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-4 mb-5 animate-pulse">
        <div className="h-4 w-48 bg-surface-2 rounded mb-2" />
        <div className="h-3 w-72 bg-surface-2 rounded" />
      </div>
    )
  }

  const { total, done, pending } = bannerSummary
  if (total === 0) return null

  const userName = (currentUser.name || currentUser.email.split('@')[0]).split(' ')[0]
  const hour = new Date().getHours()

  if (pending === 0) {
    return (
      <div className="rounded-2xl border border-primary/25 bg-surface p-4 mb-5">
        <div className="flex items-start gap-3.5 flex-wrap">
          <div className="text-[30px] leading-none shrink-0">🏆</div>
          <div className="flex-1 min-w-[200px]">
            <div className="text-[16.5px] font-bold text-text">
              Outstanding work, {userName}! All tasks completed.
            </div>
            <div className="text-[14px] text-text-muted mt-1">
              You've finished all <strong>{total} task{total > 1 ? 's' : ''}</strong> for today. Your score is
              looking great — keep this consistency going every day!
            </div>
            <div className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-primary bg-primary-tint border border-primary/20 rounded-full px-2.5 py-1 mt-2.5">
              ✅ {done} / {total} Done Today
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate?.('tasks')}
            className="shrink-0 text-[14.5px] font-bold text-white bg-primary rounded-lg px-3.5 py-2"
          >
            View Tasks
          </button>
        </div>
      </div>
    )
  }

  const isUrgent = hour >= 16
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="rounded-2xl border border-primary/25 bg-surface p-4 mb-5">
      <div className="flex items-start gap-3.5 flex-wrap">
        <div className="text-[30px] leading-none shrink-0">{isUrgent ? '⚠️' : '📋'}</div>
        <div className="flex-1 min-w-[200px]">
          <div className="text-[16.5px] font-bold text-text">
            {greet}, {userName}! You have <span className="text-primary">{pending}</span> pending task
            {pending > 1 ? 's' : ''} today.
          </div>
          <div className="text-[14px] text-text-muted mt-1">
            <strong>
              {done} of {total}
            </strong>{' '}
            task{total > 1 ? 's' : ''} completed so far.{' '}
            {!isUrgent && 'Head to your Task Checklist and mark them done to boost your score.'}
          </div>
          {isUrgent && (
            <div className="text-[13.5px] font-semibold text-danger mt-2">
              ⚠️ Day is ending — please complete your tasks before close of business!
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => onNavigate?.('tasks')}
          className="shrink-0 text-[14.5px] font-bold text-white bg-primary rounded-lg px-3.5 py-2"
        >
          Go to Tasks →
        </button>
      </div>
    </div>
  )
}
