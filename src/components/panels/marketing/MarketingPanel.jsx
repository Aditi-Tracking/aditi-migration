import CNSectionPanel from '../../shared/CNSectionPanel'

// SmartFleet's 3 and Enterprise Solution's 2 sub-folders are plain external Google Drive links,
// not real content_nodes categories — same "hardcoded, no Supabase" shape as ResourcesPanel's
// owner-tier cards. Each top-level key must match an existing content_nodes category's name
// (lowercased) — see CNSectionPanel's own linkFolders comment. The real card is named "Enterprise
// Solution" (not "Enterprise"), confirmed against the live Marketing grid.
const MARKETING_LINK_FOLDERS = {
  smartfleet: [
    { name: 'Brochure', url: 'https://drive.google.com/drive/folders/15AiOGhbPOToFZGAIyMAEMdy6zg6c0NhM' },
    { name: 'Static', url: 'https://drive.google.com/drive/folders/1grs3s7WlLc3FT0t0aDtoo9b0MjcvMhjs' },
    { name: 'Videos', url: 'https://drive.google.com/drive/folders/14GIsBlxs9XdqCN-vmKYcU1hPK0yw9d4n' },
  ],
  'enterprise solution': [
    { name: 'Click task', url: 'https://drive.google.com/drive/folders/1ZojysmGksKS3iGkwdsoKj31fntoJSde6' },
    { name: 'Cool bus', url: 'https://drive.google.com/drive/folders/1Pg79cLwMfJfQx1y_5KYDPsESU724sdfA' },
  ],
}

// Ported from old-portal/js/marketing.js's loadMarketingCounts — despite the
// source having "known-cards-first" and quiz-tab logic, the actual live
// HTML has no static cards to hardcode-order and the quiz/Assessment tab is
// unconditionally hidden for Marketing (_hideAssessmentTab(), see
// old-portal/js/training.js:1094's comment). Production behavior today is
// the same plain content-nodes grid as Sales/After Sales/IT Admin — see
// MIGRATION-NOTES.md's "Dead code observed" note for what was NOT ported.
export default function MarketingPanel() {
  return <CNSectionPanel sectionName="Marketing" title="Marketing" breadcrumb="Home › Marketing" linkFolders={MARKETING_LINK_FOLDERS} />
}
