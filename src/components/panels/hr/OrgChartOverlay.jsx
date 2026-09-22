import { useEffect, useState } from 'react'
import OverlayShell from '../../shared/OverlayShell'
import { CN } from '../../../lib/contentNodes'
import { useFileViewer } from '../../../context/FileViewerContext'

// Ported from old-portal/js/products.js's openOrgChartPicker/openOrgChartOverlay/
// backToOrgChartPicker/closeOrgChartOverlay — functionally an HR/Org-Chart
// feature, moved to its correct home in this React module (see plan notes).
const OFFICES = [
  {
    type: 'Head Office',
    color: '#2563EB',
    title: 'Head Office',
    desc: 'Mumbai HQ team structure',
  },
  {
    type: 'Branch Office',
    color: '#2563EB',
    title: 'Branch Offices',
    desc: 'Goa, Bengaluru, Ahmedabad & more',
  },
]

export default function OrgChartOverlay({ open, hrSectionId, onClose }) {
  const { openFileViewer } = useFileViewer()
  const [screen, setScreen] = useState('picker') // 'picker' | 'docs'
  const [moduleType, setModuleType] = useState(null)
  const [loading, setLoading] = useState(false)
  const [docs, setDocs] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    // Reset to the picker screen each time the overlay opens — it stays
    // mounted between opens/closes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) setScreen('picker')
  }, [open])

  async function selectOffice(type) {
    setModuleType(type)
    setScreen('docs')
    setLoading(true)
    setError('')
    setDocs([])

    try {
      const isHead = type === 'Head Office'
      const cats = CN.getCategories(hrSectionId)
      const orgCat = cats.find(
        (c) => (c.name || '').toLowerCase().includes('organization') || (c.name || '').toLowerCase().includes('org chart')
      )
      let resultDocs = []
      if (orgCat) {
        if (isHead) {
          resultDocs = CN.getFiles(orgCat.id)
        } else {
          const subCats = CN.getCategories(orgCat.id)
          const branchCat = subCats.find((c) => (c.name || '').toLowerCase().includes('branch'))
          if (branchCat) resultDocs = CN.getFiles(branchCat.id)
        }
      }

      setLoading(false)

      // Head Office — if only 1 doc, open directly
      if (isHead && resultDocs.length === 1) {
        onClose()
        openFileViewer(resultDocs[0].url, resultDocs[0].name || 'Org Chart')
        return
      }

      setDocs(resultDocs)
    } catch (e) {
      setLoading(false)
      setError('Error loading documents: ' + e.message)
    }
  }

  if (!open) return null

  const isHead = moduleType === 'Head Office'

  return (
    <OverlayShell open={open} onClose={onClose} maxWidth="max-w-lg">
      {screen === 'picker' ? (
        <>
          <div className="text-[17px] font-bold text-text mb-1 pr-8">🏢 Organization Chart</div>
          <div className="text-[14px] text-text-muted mb-5">Select office to view the org chart</div>
          <div className="grid grid-cols-2 gap-3">
            {OFFICES.map((o) => (
              <button
                key={o.type}
                type="button"
                onClick={() => selectOffice(o.type)}
                className="rounded-xl border border-border bg-surface-2 p-4 text-center hover:border-primary/40 hover:-translate-y-0.5 transition-all"
              >
                <div className="w-11 h-11 mx-auto rounded-lg bg-primary-tint border border-primary/20 flex items-center justify-center text-primary mb-3">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="8" y="2" width="8" height="4" rx="1" />
                    <rect x="1" y="17" width="6" height="4" rx="1" />
                    <rect x="9" y="17" width="6" height="4" rx="1" />
                    <rect x="17" y="17" width="6" height="4" rx="1" />
                    <path d="M12 6v4M4 17v-3a2 2 0 012-2h12a2 2 0 012 2v3" />
                    <line x1="12" y1="10" x2="12" y2="12" />
                  </svg>
                </div>
                <div className="text-[15px] font-bold text-text">{o.title}</div>
                <div className="text-[13px] text-text-muted mt-1">{o.desc}</div>
                <div className="text-[13px] font-semibold text-primary mt-2.5">View Charts →</div>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2.5 mb-5 pr-8">
            <button type="button" onClick={() => setScreen('picker')} className="text-text-muted text-[18px] leading-none">
              ←
            </button>
            <div>
              <div className="text-[16px] font-bold text-text">
                {isHead ? '🏢 Head Office — Org Charts' : '🏬 Branch Offices — Org Charts'}
              </div>
              <div className="text-[13.5px] text-text-muted mt-0.5">
                {isHead ? 'Mumbai Head Office organizational structure.' : 'Goa, Bengaluru, Ahmedabad and other branch office org charts.'}
              </div>
            </div>
          </div>

          {loading && <div className="text-center py-10 text-text-muted text-[14.5px]">Loading…</div>}
          {!loading && error && <div className="text-center py-10 text-danger text-[14.5px]">{error}</div>}
          {!loading && !error && !docs.length && (
            <div className="text-center py-10 text-text-muted text-[14.5px]">No documents found.</div>
          )}
          {!loading && !error && docs.length > 0 && (
            <div className="flex flex-col gap-2.5">
              {docs.map((doc) => (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => openFileViewer(doc.url, doc.name)}
                  className="flex items-center gap-3.5 rounded-lg border border-border bg-surface-2 px-4 py-3 text-left hover:border-primary/40 transition-colors"
                >
                  <div className="w-9 h-9 rounded-md bg-primary-tint border border-primary/20 flex items-center justify-center text-primary shrink-0">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="8" y="2" width="8" height="4" rx="1" />
                      <rect x="1" y="17" width="6" height="4" rx="1" />
                      <rect x="9" y="17" width="6" height="4" rx="1" />
                      <rect x="17" y="17" width="6" height="4" rx="1" />
                      <path d="M12 6v4M4 17v-3a2 2 0 012-2h12a2 2 0 012 2v3" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14.5px] font-semibold text-text truncate">{doc.name}</div>
                    <div className="text-[13px] text-primary mt-0.5">🔗 Open Document</div>
                  </div>
                  <span className="text-primary text-[15px] shrink-0">→</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </OverlayShell>
  )
}
