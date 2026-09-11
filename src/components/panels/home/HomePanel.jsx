import { useEffect, useState } from 'react'
import { useAuth } from '../../../context/AuthContext'
import { useCelebrations } from '../../../context/CelebrationsContext'
import { SB_HDRS, SUPABASE_URL } from '../../../lib/supabaseClient'
import { useAnnouncementUpdates } from '../../../hooks/useAnnouncementUpdates'
import { computeUnreadCount, markAllSeen } from '../../../lib/announcements'
import AnnouncementBellButton from './AnnouncementBellButton'
import AnnouncementsDrawer from './AnnouncementsDrawer'
import HomeContentSections from './HomeContentSections'
import CelebrationBanner from './CelebrationBanner'
import TaskAlertBanner from './TaskAlertBanner'
import { FAQ_ITEMS } from './faqData'

// Ported from old-portal/js/home.js (fetchUserProfilePhoto) and the static
// #panel-home HTML (MD message / How-to / Emergency Contacts / FAQs are all
// hardcoded, no data source — copied verbatim). The Celebrations banner is
// its own subsystem (see lib/celebrations.js + CelebrationsContext) — the
// banner UI is Home-scoped, but the wish popup it can open is global. The
// Task Alert Banner (TaskAlertBanner) is likewise Home-scoped, backed by
// TaskChecklistNavContext (Task Checklist Phase 3).
const HOW_TO_STEPS = [
  {
    title: 'Login with your credentials',
    desc: 'Use your official Aditi email ID and the password shared by MIS. Contact MIS if you face login issues.',
  },
  {
    title: 'Navigate via the left sidebar',
    desc: 'Click Dashboards to expand live dashboards and the all company system is there',
  },
  {
    title: 'Use filters & search',
    desc: 'Each dashboard has date, person, and keyword filters. Use the Reset button to clear all active filters at once.',
  },
  {
    title: 'Access Training & Documents',
    desc: 'Click Training for module-wise video guides or Documents for HR policies, SOPs and the org chart.',
  },
  {
    title: 'Refresh data anytime',
    desc: 'Hit the Refresh button on any dashboard header to fetch the latest data.',
  },
]

const CONTACT_GROUPS = [
  {
    label: 'MIS',
    icon: '🖥️',
    avatar: 'IT',
    name: 'MIS',
    phone: '+918655480766',
    phoneDisplay: '+91 8655480766',
    email: 'mis1@adititracking.com',
    hours: 'Mon–Sat 10am–7pm',
  },
  {
    label: 'HR Department',
    icon: '👥',
    avatar: 'HR',
    name: 'HR Team',
    phone: '+917304530851',
    phoneDisplay: '+91 7304530851',
    email: 'hr@adititracking.com',
    hours: 'Mon–Sat 10am–7pm',
  },
  {
    label: 'Admin / Operations',
    icon: '🏢',
    avatar: 'AD',
    name: 'Admin Office',
    phone: '+918451966554',
    phoneDisplay: '+91 8451966554',
    email: 'hetal@adititracking.com',
    hours: 'Mon–Sat 10am–7pm',
  },
]

export default function HomePanel({ onNavigate }) {
  const { currentUser } = useAuth()
  const firstName = (currentUser?.name || currentUser?.email?.split('@')[0] || '').split(' ')[0]

  const [profile, setProfile] = useState({ loading: true, name: '', dept: '', photoUrl: null })

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!currentUser) return
      const userName = (currentUser.name || '').trim()
      const userEmail = String(currentUser.email || '').trim()
      try {
        let row = null
        if (userEmail) {
          const res = await fetch(
            `${SUPABASE_URL}/rest/v1/Employee_details?select=*&Email_Id=ilike.${encodeURIComponent(userEmail)}&limit=1`,
            { headers: SB_HDRS() }
          )
          const data = await res.json()
          if (Array.isArray(data) && data.length > 0) row = data[0]
        }
        if (!row && userName) {
          const res = await fetch(
            `${SUPABASE_URL}/rest/v1/Employee_details?select=*&Employee_name=ilike.${encodeURIComponent(userName)}&limit=1`,
            { headers: SB_HDRS() }
          )
          const data = await res.json()
          if (Array.isArray(data) && data.length > 0) row = data[0]
        }
        if (cancelled) return
        const name = (row && row['Employee_name']) || userName
        const dept = (row && row['Employee_Dept']) || currentUser.rawRole || 'Employee'
        const photoUrl = row ? row['avatar_url'] || row['Link'] || null : null
        setProfile({ loading: false, name, dept, photoUrl })
      } catch {
        if (cancelled) return
        setProfile({ loading: false, name: userName, dept: currentUser.rawRole || 'Employee', photoUrl: null })
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [currentUser])

  const { updates, loading: updatesLoading, error: updatesError, refetch } = useAnnouncementUpdates()
  const { birthdays, anniversaries } = useCelebrations()
  const todaysCelebs = [
    ...birthdays.map((p) => ({ ...p, celebType: 'birthday' })),
    ...anniversaries.map((p) => ({ ...p, celebType: 'anniversary' })),
  ]
  const [drawerOpen, setDrawerOpen] = useState(false)
  const unreadCount = computeUnreadCount(updates, todaysCelebs)

  function openDrawer() {
    setDrawerOpen(true)
    markAllSeen(updates, todaysCelebs)
  }

  const deptLabel = (profile.dept || 'Employee').charAt(0).toUpperCase() + (profile.dept || 'Employee').slice(1)

  return (
    <div className="px-4 sm:px-6 py-5">
      <div className="text-[19px] font-semibold text-text">
        Welcome, <span className="text-primary">{firstName || 'there'}!</span>
      </div>
      <div className="text-[12.5px] text-text-muted mt-1 mb-5">
        to our <strong className="text-text">Aditi Portal</strong> — your unified command centre to track, train and grow.
      </div>

      <TaskAlertBanner onNavigate={onNavigate} />
      <CelebrationBanner />

      {/* Employee profile banner */}
      <div className="flex flex-wrap items-stretch gap-4 rounded-2xl border border-border bg-surface p-4 mb-5">
        <div className="flex items-center gap-4 flex-1 min-w-[220px]">
          {profile.photoUrl ? (
            <img src={profile.photoUrl} alt="" className="w-[72px] h-[72px] rounded-full object-cover shrink-0" />
          ) : (
            <div className="w-[72px] h-[72px] rounded-full bg-primary-tint border border-primary/20 flex items-center justify-center text-primary text-[26px] font-semibold shrink-0">
              {(profile.name || currentUser?.name || 'U')[0]?.toUpperCase()}
            </div>
          )}
          <div>
            <div className="text-[14.5px] font-semibold text-text">{profile.name || currentUser?.name}</div>
            <div className="text-[12px] text-text-muted mt-0.5">🏢 {deptLabel}</div>
            <div className="text-[11px] text-text-muted mt-0.5">Aditi Tracking Support Pvt. Ltd.</div>
            {!profile.loading && !profile.photoUrl && (
              <div className="text-[10.5px] text-text-muted mt-1">
                📷 Profile photo not available. Please contact MIS to upload your photo.
              </div>
            )}
          </div>
        </div>
        <AnnouncementBellButton unreadCount={unreadCount} onClick={openDrawer} />
      </div>

      {/* Message from the MD — static */}
      <div className="rounded-2xl border border-border bg-surface p-5 mb-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[18px]">🎙️</span>
          <span className="text-[13.5px] font-semibold text-text">Message from the MD</span>
        </div>
        <div className="text-[12.5px] text-text-muted leading-relaxed space-y-3">
          <p>Welcome to the Aditi Tracking Knowledge Base Portal</p>
          <p>
            Dear Aditi Tracking Team, Think of global brands like McDonald's 🍔 — known for delivering consistent
            quality, service, and experience worldwide. This level of excellence comes from clear systems, defined
            processes, and empowered people.
          </p>
          <p>
            At Aditi Tracking, we are building the same standard. This portal is created for you — your personal
            platform to learn, grow, and succeed independently 🚀. Here, you can access SOPs, checklists, KPIs, role
            clarity, and growth paths — all in one place.
          </p>
          <p>
            We believe in transparency 🤝, continuous learning 📘, and equal opportunities for everyone to grow.
            Today, we are proud to be among India's leading telematics companies 🇮🇳. Tomorrow, we aim to become the
            world's number one 🌍 — and that journey begins with you.
          </p>
          <p>Let's build excellence together.</p>
          <p className="leading-tight">
            Chirag Rachh
            <br />
            Founder &amp; Managing Director
            <br />
            Aditi Tracking Support Pvt Ltd
          </p>
        </div>
        <div className="mt-3 pt-3 border-t border-border text-[11px] text-text-muted">
          Founded Aditi Tracking Support Pvt. Ltd. (ATSPL) · 2011 · Mumbai, India
        </div>
      </div>

      <HomeContentSections />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        {/* How to use */}
        <div className="rounded-2xl border border-border bg-surface p-5">
          <div className="flex items-center gap-2 mb-3.5">
            <span className="text-[18px]">📖</span>
            <span className="text-[13.5px] font-semibold text-text">How to Use This Portal</span>
          </div>
          <div className="flex flex-col gap-3.5">
            {HOW_TO_STEPS.map((s, i) => (
              <div key={s.title} className="flex gap-3">
                <div className="w-6 h-6 rounded-full bg-primary-tint text-primary border border-primary/20 flex items-center justify-center text-[11px] font-bold shrink-0">
                  {i + 1}
                </div>
                <div>
                  <div className="text-[12.5px] font-semibold text-text">{s.title}</div>
                  <div className="text-[11.5px] text-text-muted mt-0.5 leading-relaxed">{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Emergency contacts */}
        <div className="rounded-2xl border border-border bg-surface p-5">
          <div className="flex items-center gap-2 mb-3.5">
            <span className="text-[18px]">📞</span>
            <span className="text-[13.5px] font-semibold text-text">Emergency Contacts</span>
          </div>
          <div className="flex flex-col gap-3">
            {CONTACT_GROUPS.map((g) => (
              <div key={g.label}>
                <div className="text-[11px] font-semibold text-text-muted mb-1.5">
                  {g.icon} {g.label}
                </div>
                <div className="flex items-center gap-3 rounded-lg bg-surface-2 border border-border px-3 py-2.5">
                  <div className="w-8 h-8 rounded-lg bg-primary-tint text-primary flex items-center justify-center text-[11px] font-bold shrink-0">
                    {g.avatar}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-medium text-text">{g.name}</div>
                    <a href={`tel:${g.phone}`} className="text-[11px] text-primary block">
                      {g.phoneDisplay}
                    </a>
                    <a href={`mailto:${g.email}`} className="text-[11px] text-primary block truncate">
                      {g.email}
                    </a>
                  </div>
                  <div className="text-[10.5px] text-text-muted shrink-0 whitespace-nowrap">{g.hours}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* FAQs — static */}
      <div className="rounded-2xl border border-border bg-surface p-5">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[18px]">❓</span>
          <span className="text-[13.5px] font-semibold text-text">FAQs</span>
          <span className="ml-auto text-[10.5px] font-medium text-primary bg-primary-tint border border-primary/20 rounded-full px-2.5 py-1">
            {FAQ_ITEMS.length} Questions
          </span>
        </div>
        <div className="text-[11.5px] text-text-muted mb-3">
          Frequently asked questions about Aditi Tracking's products, services, and features. Click on any question to
          view the answer.
        </div>
        <div className="flex flex-col gap-2">
          {FAQ_ITEMS.map((f, i) => (
            <details key={f.q} className="rounded-lg border border-border bg-surface-2 px-3.5 py-2.5 group">
              <summary className="flex items-center gap-2.5 cursor-pointer list-none text-[12.5px] font-medium text-text">
                <span className="text-[10.5px] text-text-muted w-5 shrink-0">{i + 1}</span>
                <span className="flex-1">{f.q}</span>
                <span className="text-text-muted transition-transform group-open:rotate-180">⌄</span>
              </summary>
              <div className="text-[12px] text-text-muted mt-2 pl-[30px] leading-relaxed">
                {f.link ? (
                  <>
                    {f.a.replace(f.link.label, '')}
                    <a href={f.link.href} target="_blank" rel="noreferrer" className="text-primary underline">
                      {f.link.label}
                    </a>
                  </>
                ) : (
                  f.a
                )}
              </div>
            </details>
          ))}
        </div>
        <div className="mt-3 pt-3 border-t border-border text-[11px] text-text-muted">
          Still have questions? Visit{' '}
          <a href="https://www.adititracking.com/faqs/" target="_blank" rel="noreferrer" className="text-primary underline">
            adititracking.com/faqs
          </a>{' '}
          or{' '}
          <a href="https://www.adititracking.com/contact-us/" target="_blank" rel="noreferrer" className="text-primary underline">
            contact our team
          </a>
          .
        </div>
      </div>

      <AnnouncementsDrawer
        open={drawerOpen}
        updates={updates}
        loading={updatesLoading}
        error={updatesError}
        onClose={() => setDrawerOpen(false)}
        onRefetch={refetch}
      />
    </div>
  )
}
