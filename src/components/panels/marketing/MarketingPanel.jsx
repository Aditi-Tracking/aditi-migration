import CNSectionPanel from '../../shared/CNSectionPanel'

// SmartFleet's 3 sub-folders are plain external Google Drive links, not real content_nodes
// categories — same "hardcoded, no Supabase" shape as ResourcesPanel's owner-tier cards. Brochure
// has no link yet (pending); it'll get one once it's shared.
const SMARTFLEET_LINKS = {
  smartfleet: [
    { name: 'Brochure', url: 'https://drive.google.com/drive/folders/15AiOGhbPOToFZGAIyMAEMdy6zg6c0NhM' },
    { name: 'Static', url: 'https://drive.google.com/drive/folders/1grs3s7WlLc3FT0t0aDtoo9b0MjcvMhjs' },
    { name: 'Videos', url: 'https://drive.google.com/drive/folders/14GIsBlxs9XdqCN-vmKYcU1hPK0yw9d4n' },
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
  return <CNSectionPanel sectionName="Marketing" title="Marketing" breadcrumb="Home › Marketing" linkFolders={SMARTFLEET_LINKS} />
}
