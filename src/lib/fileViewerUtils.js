// Ported from old-portal/js/app.js verbatim (isOfficeDocUrl/toEmbeddableUrl/
// toDriveEmbedUrl/isDirectVideoUrl) — used by FileViewerContext to decide how
// to render a given document URL.

export function isOfficeDocUrl(url) {
  if (!url) return false
  const ext = url.split('?')[0].split('#')[0].split('.').pop().toLowerCase()
  return ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext)
}

// Convert any Google Drive URL to its embeddable form
export function toDriveEmbedUrl(url) {
  if (!url) return url
  try {
    // 1) Folder URL: /drive/folders/FOLDER_ID -> embeddedfolderview
    const folderMatch = url.match(/\/drive\/folders\/([a-zA-Z0-9_-]+)/)
    if (folderMatch) {
      return 'https://drive.google.com/embeddedfolderview?id=' + folderMatch[1] + '#grid'
    }
    // 2) File URL: /file/d/FILE_ID/... -> /preview
    const fileMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)
    if (fileMatch) {
      return 'https://drive.google.com/file/d/' + fileMatch[1] + '/preview'
    }
    // 3) Google Docs / Sheets / Slides -> /preview
    const docMatch = url.match(/docs\.google\.com\/(document|spreadsheets|presentation)\/d\/([a-zA-Z0-9_-]+)/)
    if (docMatch) {
      return 'https://docs.google.com/' + docMatch[1] + '/d/' + docMatch[2] + '/preview'
    }
    // 4) open?id=ID -> file preview
    const openMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/)
    if (openMatch && url.indexOf('drive.google.com') >= 0) {
      return 'https://drive.google.com/file/d/' + openMatch[1] + '/preview'
    }
  } catch {
    /* fall through to raw URL */
  }
  return url
}

// Office docs (doc/docx/xls/xlsx/ppt/pptx) hosted anywhere other than Google
// Drive/Docs can't be rendered by the browser directly — route those through
// Microsoft's Office Online viewer instead.
export function toEmbeddableUrl(url) {
  if (isOfficeDocUrl(url) && !/drive\.google\.com|docs\.google\.com/.test(url)) {
    return 'https://view.officeapps.live.com/op/embed.aspx?src=' + encodeURIComponent(url)
  }
  return toDriveEmbedUrl(url)
}

export function isDirectVideoUrl(url) {
  if (!url) return false
  const ext = url.split('?')[0].split('#')[0].split('.').pop().toLowerCase()
  return ['mp4', 'webm', 'mov', 'm4v', 'ogg', 'ogv'].includes(ext)
}

export function isYouTubeUrl(url) {
  return /(?:youtube\.com|youtu\.be)/i.test(url || '')
}
