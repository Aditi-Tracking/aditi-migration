import CNSectionPanel from '../../shared/CNSectionPanel'

// Ported from old-portal/js/app.js's loadSimpleCNPanel('itadmin', 'IT Admin')
// — a plain content-nodes grid, same generic shape as Sales/After Sales
// (old-portal shares one generic loader across Finance/IT Admin/Resources
// rather than a per-module function like sales.js/aftersales.js have, but
// the underlying pattern — CN.getSection + card grid + overlay — is
// identical, so CNSectionPanel applies directly here too).
export default function ITAdminPanel() {
  return <CNSectionPanel sectionName="IT Admin" title="IT & Admin" breadcrumb="Home › IT & Admin" />
}
