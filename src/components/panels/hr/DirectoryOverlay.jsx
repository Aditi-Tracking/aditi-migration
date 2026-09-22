import OverlayShell from '../../shared/OverlayShell'
import { CN } from '../../../lib/contentNodes'
import { useFileViewer } from '../../../context/FileViewerContext'

// Ported from old-portal/js/products.js's openDirectoryOverlay/closeDirectoryOverlay
// and old-portal/js/app.js's openDirectoryDoc.
const DIRECTORY_ROWS = [
  {
    module: 'Employee Dir',
    label: 'Employee Directory',
    desc: 'Departments, roles, contact details & reporting structure',
  },
  {
    module: 'Support Dir',
    label: 'Support Directory',
    desc: 'Support contacts, escalation paths & helpdesk resources',
  },
  {
    module: 'Vendor Dir',
    label: 'Vendor Directory',
    desc: 'Approved vendors, suppliers & service partners',
  },
]

export default function DirectoryOverlay({ open, hrSectionId, onClose }) {
  const { openFileViewer } = useFileViewer()

  function openDirectoryDoc(module, displayName) {
    try {
      const cats = CN.getCategories(hrSectionId)
      const dirCat = cats.find((c) => (c.name || '').toLowerCase().includes('director'))
      let fileData = null
      if (dirCat) {
        const subCats = CN.getCategories(dirCat.id)
        const match = subCats.find((c) => (c.name || '').toLowerCase().includes(module.trim().toLowerCase()))
        if (match) {
          const files = CN.getFiles(match.id)
          if (files.length) fileData = files[0]
        }
        if (!fileData) {
          const direct = CN.getFiles(dirCat.id)
          if (direct.length) fileData = direct[0]
        }
      }
      if (fileData && fileData.url) {
        openFileViewer(fileData.url, fileData.name || displayName)
      } else {
        alert('No file found for ' + (displayName || module) + '. Please add files in the files table.')
      }
    } catch (e) {
      alert('Error: ' + e.message)
    }
  }

  if (!open) return null

  return (
    <OverlayShell open={open} onClose={onClose} maxWidth="max-w-lg">
      <div className="text-[17px] font-bold text-text mb-1 pr-8">👥 Directory</div>
      <div className="text-[14px] text-text-muted mb-5">Employee, Support & Vendor contacts</div>

      <div className="flex flex-col gap-2.5">
        {DIRECTORY_ROWS.map((row) => (
          <button
            key={row.module}
            type="button"
            onClick={() => openDirectoryDoc(row.module, row.label)}
            className="flex items-center gap-3.5 rounded-lg border border-border bg-surface-2 px-4 py-3 text-left hover:border-primary/40 transition-colors"
          >
            <div className="w-9 h-9 rounded-md bg-primary-tint border border-primary/20 flex items-center justify-center text-primary shrink-0">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 00-3-3.87" />
                <path d="M16 3.13a4 4 0 010 7.75" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[14.5px] font-semibold text-text">{row.label}</div>
              <div className="text-[13px] text-text-muted mt-0.5">{row.desc}</div>
            </div>
            <span className="text-primary text-[15px] shrink-0">→</span>
          </button>
        ))}
      </div>
    </OverlayShell>
  )
}
