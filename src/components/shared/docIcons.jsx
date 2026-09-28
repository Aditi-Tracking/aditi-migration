// Split out from DocCard.jsx — a file exporting a component may only export
// components (react-refresh/only-export-components), so shared icon
// constants live here instead.
export const DOC_ICON = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
  </svg>
)

// Scoped exception to the app-wide unified-blue file icon — PDF/video files in CNCategoryBrowser's
// file rows only (see that file's fileCardMeta). Every other file type keeps DOC_ICON above,
// unchanged. Filled (not stroke) glyphs, since these render white-on-color, matching the reference
// look: page-with-folded-corner for PDF, a plain play-triangle for video.
export const PDF_ICON = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
    <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7z" />
    <path d="M13 2v5h5" fillOpacity="0.55" />
  </svg>
)

export const VIDEO_ICON = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
    <path d="M8 5v14l11-7z" />
  </svg>
)

// Ported verbatim from ResourcesPanel.jsx's local FOLDER_ICON — shared here so any other
// hardcoded "card opens an external Drive folder" list (e.g. CNSectionPanel's `linkFolders`) can
// reuse the exact same glyph instead of redefining it per panel.
export const FOLDER_ICON = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
  </svg>
)
