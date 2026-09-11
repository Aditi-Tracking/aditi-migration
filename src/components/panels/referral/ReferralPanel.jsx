import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../../context/AuthContext'
import { SB_HDRS, SUPABASE_URL } from '../../../lib/supabaseClient'
import {
  canPostReferralRole,
  canSeeReferralPipeline,
  canViewMyReferrals,
  canViewOpenRoles,
} from '../../../lib/referralPermissions'
import OpenRolesTab from './OpenRolesTab'
import MyReferralsTab from './MyReferralsTab'
import PipelineTab from './PipelineTab'
import PostRoleTab from './PostRoleTab'
import ReferModal from './ReferModal'

// Ported from old-portal/js/referral.js's initReferralProgramme/
// switchReferralTab. Open Roles + My Referrals load once, eagerly, when the
// panel mounts (kept mounted-but-hidden via CSS so switching tabs doesn't
// refetch — matches old-portal's .ref-tab/.active toggle). Pipeline and
// Post a Role reload fresh every time they're switched to (no old-portal
// "loaded once" flag for either) — mapped here as conditional mount/unmount.
const TABS = [
  { id: 'roles', label: '📋 Open Roles' },
  { id: 'mine', label: '🧾 My Referrals' },
  { id: 'pipeline', label: '📊 Pipeline' },
  { id: 'post', label: '➕ Post a Role' },
]

export default function ReferralPanel() {
  const { currentUser, permissions } = useAuth()
  const canRoles = canViewOpenRoles(permissions)
  const canMine = canViewMyReferrals(permissions)
  const canPipe = canSeeReferralPipeline(currentUser, permissions)
  const canPost = canPostReferralRole(currentUser, permissions)
  const visibility = { roles: canRoles, mine: canMine, pipeline: canPipe, post: canPost }
  const visibleTabs = TABS.filter((t) => visibility[t.id])

  const [activeTab, setActiveTab] = useState(() => visibleTabs[0]?.id || 'roles')

  const [openings, setOpenings] = useState([])
  const [openingsLoading, setOpeningsLoading] = useState(true)
  const [openingsError, setOpeningsError] = useState('')

  const [myReferrals, setMyReferrals] = useState([])
  const [myReferralsLoading, setMyReferralsLoading] = useState(true)
  const [myReferralsError, setMyReferralsError] = useState('')

  const [referModalOpening, setReferModalOpening] = useState(null) // { id, title } | null

  const loadOpenings = useCallback(async () => {
    setOpeningsLoading(true)
    setOpeningsError('')
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/job_openings?select=*&status=eq.Open&order=posted_date.desc`, {
        headers: SB_HDRS(),
      })
      if (!res.ok) throw new Error('Could not load openings (' + res.status + ')')
      setOpenings(await res.json())
    } catch (e) {
      setOpeningsError(e.message + ' — has the job_openings table been created in Supabase?')
    } finally {
      setOpeningsLoading(false)
    }
  }, [])

  const loadMyReferrals = useCallback(async () => {
    if (!currentUser?.email) return
    setMyReferralsLoading(true)
    setMyReferralsError('')
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/referrals?select=*&referrer_email=ilike.${encodeURIComponent(currentUser.email)}&order=submitted_at.desc`,
        { headers: SB_HDRS() }
      )
      if (!res.ok) throw new Error('Could not load your referrals (' + res.status + ')')
      setMyReferrals(await res.json())
    } catch (e) {
      setMyReferralsError(e.message)
    } finally {
      setMyReferralsLoading(false)
    }
  }, [currentUser])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- panel-open-time fetch, mirrors old-portal's initReferralProgramme()
    loadOpenings()
  }, [loadOpenings])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- panel-open-time fetch, mirrors old-portal's initReferralProgramme()
    loadMyReferrals()
  }, [loadMyReferrals])

  return (
    <div className="px-4 sm:px-6 py-5">
      <div className="mb-1">
        <div className="text-[16px] font-semibold text-text">Referral</div>
        <div className="text-[11.5px] text-text-muted mt-0.5">Home › Referral</div>
      </div>

      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-primary-tint px-5 py-4 mt-4 mb-5">
        <div>
          <div className="text-[24px] font-bold text-primary leading-none">₹2,000</div>
          <div className="text-[11px] text-text-muted mt-1">per successful referral</div>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 ml-auto text-[11.5px] text-text-muted">
          <div>✅ Friends only — not family</div>
          <div>
            ⏱️ Paid after the referred friend completes <strong className="text-text">90 days</strong>
          </div>
          <div>♾️ Unlimited referrals per employee</div>
        </div>
      </div>

      <div className="flex gap-1.5 flex-wrap mb-5">
        {visibleTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={`rounded-lg px-3.5 py-2 text-[12.5px] font-medium border transition-colors ${
              activeTab === t.id
                ? 'bg-primary-tint text-primary border-primary/30'
                : 'bg-surface-2 text-text-muted border-border hover:text-text'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className={activeTab === 'roles' ? '' : 'hidden'}>
        <OpenRolesTab
          openings={openings}
          loading={openingsLoading}
          error={openingsError}
          onRefer={(id, title) => setReferModalOpening({ id, title })}
        />
      </div>
      <div className={activeTab === 'mine' ? '' : 'hidden'}>
        <MyReferralsTab referrals={myReferrals} loading={myReferralsLoading} error={myReferralsError} />
      </div>
      {activeTab === 'pipeline' && canPipe && <PipelineTab />}
      {activeTab === 'post' && canPost && <PostRoleTab onOpeningsChanged={loadOpenings} />}

      <ReferModal opening={referModalOpening} onClose={() => setReferModalOpening(null)} onSubmitted={loadMyReferrals} />
    </div>
  )
}
