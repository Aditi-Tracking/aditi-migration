import { useState } from 'react'
import { useAuth } from '../../../context/AuthContext'
import CNSectionPanel from '../../shared/CNSectionPanel'
import DocCard from '../../shared/DocCard'
import { DOC_ICON } from '../../shared/docIcons'

// Ported from old-portal/js/app.js's loadResourcesUploads() + index.html's
// #resources-main/#resources-docs view toggle (resourcesShowDocs/
// resourcesShowMain). Role gate is CURRENT_USER.role === 'owner' — the
// whole owner-tier group (owner/MD, mis, pc, executive assistant), not
// literally just the MD account.
//
// Owner-tier sees 2 hardcoded cards, one of which drills into 5 more
// hardcoded cards, all of them plain external Google Drive links (no
// Supabase, no file viewer — copied verbatim from the HTML). Everyone else
// sees the dynamic `Resources` content_nodes section instead — the two are
// mutually exclusive. Panel is titled "Documents" (matching the sidebar nav
// label) even though the underlying CN section name is still "Resources".

const FOLDER_ICON = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
  </svg>
)

const SHIELD_CHECK_ICON = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <polyline points="9 12 11 14 15 10" />
  </svg>
)

const SHIELD_ICON = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
)

const ISO_ICON = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="6" />
    <path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11" />
  </svg>
)

const CERT_ICON = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M9 9h6M9 12h6M9 15h4" />
  </svg>
)

const IDCARD_ICON = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 7H4a2 2 0 00-2 2v6a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z" />
    <circle cx="12" cy="12" r="2" />
    <path d="M6 12h.01M18 12h.01" />
  </svg>
)

const NDA_URL = 'https://drive.google.com/drive/folders/1tme02gBZJDPYTkLPMfbZ_t-j7O7VH01s'

const COMPANY_DOC_LINKS = [
  {
    name: '2025 ISO Certificates',
    desc: 'Latest ISO certification documents for the year 2025.',
    url: 'https://drive.google.com/drive/folders/1_YdPqaYqIVEGxe4ofAVSn9obeqvFjttZ',
    icon: ISO_ICON,
  },
  {
    name: 'Company DOCS',
    desc: 'Core company documents, registrations & official records.',
    url: 'https://drive.google.com/drive/folders/17REokg4iljwlBoeXDuBvofRR0DlhgPiM',
    icon: DOC_ICON,
  },
  {
    name: 'GST EPFO ESIC Certification',
    desc: 'GST, EPFO & ESIC statutory compliance certificates.',
    url: 'https://drive.google.com/drive/folders/1ukwJfX1uDg_KGiyOb6Jv9c7EaABpFjVP',
    icon: SHIELD_ICON,
  },
  {
    name: 'NSIC Certificate 25-27',
    desc: 'National Small Industries Corporation certificate valid 2025–2027.',
    url: 'https://drive.google.com/drive/folders/1ST1xis1Tgcetq1ODhAG03RStSjP6Qlih',
    icon: CERT_ICON,
  },
  {
    name: 'Prof Tax & Certificate',
    desc: 'Professional tax registration & related certificates.',
    url: 'https://drive.google.com/drive/folders/1fobc-LYiK07Y4EmRqN2SMIGE20up9lCT',
    icon: IDCARD_ICON,
  },
]

function openExternal(url) {
  window.open(url, '_blank', 'noopener,noreferrer')
}

function PanelHeader({ breadcrumb, extra }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-1">
      <div>
        <div className="text-[18px] font-bold text-text">Documents</div>
        <div className="text-[13.5px] text-text-muted mt-0.5">{breadcrumb}</div>
      </div>
      {extra}
    </div>
  )
}

export default function ResourcesPanel() {
  const { currentUser } = useAuth()
  const isOwnerTier = currentUser?.role === 'owner'
  const [view, setView] = useState('main')

  if (!isOwnerTier) {
    return <CNSectionPanel sectionName="Resources" title="Documents" breadcrumb="Home › Documents" />
  }

  if (view === 'docs') {
    return (
      <div className="px-4 sm:px-6 py-5">
        <PanelHeader
          breadcrumb={
            <>
              <button type="button" onClick={() => setView('main')} className="text-primary hover:underline underline-offset-2">
                Documents
              </button>{' '}
              › Company Docs & Certifications
            </>
          }
          extra={
            <button
              type="button"
              onClick={() => setView('main')}
              className="rounded-md border border-border bg-surface-2 px-3 py-1.5 text-[14px] font-semibold text-text"
            >
              ← Back
            </button>
          }
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-5">
          {COMPANY_DOC_LINKS.map((doc) => (
            <DocCard
              key={doc.name}
              icon={doc.icon}
              name={doc.name}
              desc={doc.desc}
              meta="📁 Open Folder"
              onClick={() => openExternal(doc.url)}
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 sm:px-6 py-5">
      <PanelHeader breadcrumb="Home › Documents" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-5">
        <DocCard
          icon={FOLDER_ICON}
          name="Company Docs & Certifications"
          desc="ISO certificates, company documents, GST, EPFO, ESIC, NSIC, Prof Tax — all official folders."
          meta="📂 View Documents"
          onClick={() => setView('docs')}
        />
        <DocCard
          icon={SHIELD_CHECK_ICON}
          name="NDA's"
          desc="Non-Disclosure Agreements — confidential contracts with employees, clients & partners."
          meta="📁 Open Drive Folder"
          onClick={() => openExternal(NDA_URL)}
        />
      </div>
    </div>
  )
}
