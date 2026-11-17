import { PDF_ICON, VIDEO_ICON } from './docIcons'

// Split out from CNCategoryBrowser.jsx — a file exporting a component may only export
// components (react-refresh/only-export-components), same reason docIcons.jsx exists.
// Shared with CNSectionPanel.jsx's own direct-file grid so both read a file's type the same way.
export function fileCardMeta(url) {
  const ext = (url || '').split('?')[0].split('.').pop().toLowerCase()
  const ytMatch = (url || '').match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/)
  const isYt = !!ytMatch
  const isVid = ['mp4', 'webm', 'mov'].includes(ext)
  const isPdf = ext === 'pdf'
  const label = isYt ? '▶ YouTube' : isVid ? '🎬 Video' : isPdf ? '📄 PDF' : '📁 Open'
  // Scoped icon-color exception (PDF/video only) — see docIcons.jsx's PDF_ICON/VIDEO_ICON comment.
  const bg = isPdf ? '#f87171' : isVid ? '#a78bfa' : null
  const icon = isPdf ? PDF_ICON : isVid ? VIDEO_ICON : null
  return { isYt, ytId: ytMatch?.[1] || null, label, bg, icon }
}
