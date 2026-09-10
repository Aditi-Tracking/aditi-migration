import { useEffect, useState } from 'react'
import { CN } from '../../../lib/contentNodes'
import { getCNCardDesc } from '../../../lib/cnCardDescriptions'
import HRDocsOverlay from './HRDocsOverlay'
import OrgChartOverlay from './OrgChartOverlay'
import DirectoryOverlay from './DirectoryOverlay'
import HolidayOverlay from './HolidayOverlay'

// Ported from old-portal/js/hr.js's loadHRSection — same card ordering:
// [known CN cards: SOP/Mediclaim/HR Policy] -> [static special cards:
// Organization Chart/Directory/Holiday List] -> [any new CN category].
const SPECIAL = ['organization chart', 'directory', 'holiday list', 'branch office']
const KNOWN_FIRST = ['sop', 'mediclaim', 'hr policy']

const DOC_ICON = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
  </svg>
)

const ORG_CHART_ICON = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="8" y="2" width="8" height="4" rx="1" />
    <rect x="1" y="17" width="6" height="4" rx="1" />
    <rect x="9" y="17" width="6" height="4" rx="1" />
    <rect x="17" y="17" width="6" height="4" rx="1" />
    <path d="M12 6v4M4 17v-3a2 2 0 012-2h12a2 2 0 012 2v3" />
    <line x1="12" y1="10" x2="12" y2="12" />
  </svg>
)

const DIRECTORY_ICON = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 00-3-3.87" />
    <path d="M16 3.13a4 4 0 010 7.75" />
  </svg>
)

const HOLIDAY_ICON = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
)

function DocCard({ icon, name, desc, meta, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left rounded-xl border border-border bg-surface p-4 hover:border-primary/40 hover:shadow-sm transition-all flex flex-col gap-3"
    >
      <div className="w-10 h-10 rounded-lg bg-primary-tint border border-primary/20 flex items-center justify-center text-primary">
        {icon}
      </div>
      <div>
        <div className="text-[13.5px] font-semibold text-text">{name}</div>
        <div className="text-[12px] text-text-muted mt-1 leading-relaxed line-clamp-2">{desc}</div>
      </div>
      <div className="mt-auto text-[11px] font-medium text-primary bg-primary-tint border border-primary/20 rounded-full px-2.5 py-1 w-fit">
        {meta}
      </div>
    </button>
  )
}

export default function HRPanel() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [hrSectionId, setHrSectionId] = useState(null)
  const [knownCats, setKnownCats] = useState([])
  const [newCats, setNewCats] = useState([])

  const [docsModule, setDocsModule] = useState(null)
  const [orgChartOpen, setOrgChartOpen] = useState(false)
  const [directoryOpen, setDirectoryOpen] = useState(false)
  const [holidayOpen, setHolidayOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    CN.load()
      .then(() => {
        if (cancelled) return
        const hrSection = CN.getSection('HR')
        if (!hrSection) {
          setLoading(false)
          return
        }
        const cats = CN.getCategories(hrSection.id)
        const docCats = cats.filter((c) => !SPECIAL.includes((c.name || '').toLowerCase().trim()))
        setHrSectionId(hrSection.id)
        setKnownCats(docCats.filter((c) => KNOWN_FIRST.includes((c.name || '').toLowerCase().trim())))
        setNewCats(docCats.filter((c) => !KNOWN_FIRST.includes((c.name || '').toLowerCase().trim())))
        setLoading(false)
      })
      .catch((e) => {
        if (cancelled) return
        setLoading(false)
        setError(e.message)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="px-4 sm:px-6 py-5">
      <div className="flex items-center justify-between gap-3 mb-1">
        <div>
          <div className="text-[16px] font-semibold text-text">HR</div>
          <div className="text-[11.5px] text-text-muted mt-0.5">Home › HR</div>
        </div>
        {/* Upload button omitted for now — part of the deferred MIS
            upload/delete subsystem (see MIGRATION-NOTES.md). */}
      </div>

      <div className="text-[12.5px] font-semibold text-text-muted uppercase tracking-wide mt-5 mb-3">HR Documents</div>

      {loading && <div className="text-center py-16 text-text-muted text-[13px]">Loading…</div>}
      {!loading && error && <div className="text-center py-16 text-danger text-[13px]">⚠️ {error}</div>}

      {!loading && !error && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {knownCats.map((cat) => (
            <DocCard
              key={cat.id}
              icon={DOC_ICON}
              name={cat.name}
              desc={getCNCardDesc(cat.name)}
              meta={`📂 ${CN.totalFiles(cat.id)} file${CN.totalFiles(cat.id) === 1 ? '' : 's'}`}
              onClick={() => setDocsModule(cat.name)}
            />
          ))}

          <DocCard
            icon={ORG_CHART_ICON}
            name="Organization Chart"
            desc="Complete team structure of Aditi Tracking — Head Office & Branch offices, departments, roles and reporting hierarchy."
            meta="🏢 View Charts"
            onClick={() => setOrgChartOpen(true)}
          />
          <DocCard
            icon={DIRECTORY_ICON}
            name="Directory"
            desc="Employee, Support & Vendor directories — contacts, roles and resources all in one place."
            meta="👥 View Directory"
            onClick={() => setDirectoryOpen(true)}
          />
          <DocCard
            icon={HOLIDAY_ICON}
            name="Holiday List"
            desc="Company holiday calendar — upcoming holidays, branch-wise list and next holiday countdown."
            meta="🎉 View Holidays"
            onClick={() => setHolidayOpen(true)}
          />

          {newCats.map((cat) => (
            <DocCard
              key={cat.id}
              icon={DOC_ICON}
              name={cat.name}
              desc={getCNCardDesc(cat.name)}
              meta={`📂 ${CN.totalFiles(cat.id)} file${CN.totalFiles(cat.id) === 1 ? '' : 's'}`}
              onClick={() => setDocsModule(cat.name)}
            />
          ))}
        </div>
      )}

      <HRDocsOverlay open={!!docsModule} module={docsModule} hrSectionId={hrSectionId} onClose={() => setDocsModule(null)} />
      <OrgChartOverlay open={orgChartOpen} hrSectionId={hrSectionId} onClose={() => setOrgChartOpen(false)} />
      <DirectoryOverlay open={directoryOpen} hrSectionId={hrSectionId} onClose={() => setDirectoryOpen(false)} />
      <HolidayOverlay open={holidayOpen} onClose={() => setHolidayOpen(false)} />
    </div>
  )
}
