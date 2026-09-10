import CNSectionPanel from '../../shared/CNSectionPanel'

// Ported from old-portal/js/marketing.js's loadMarketingCounts — despite the
// source having "known-cards-first" and quiz-tab logic, the actual live
// HTML has no static cards to hardcode-order and the quiz/Assessment tab is
// unconditionally hidden for Marketing (_hideAssessmentTab(), see
// old-portal/js/training.js:1094's comment). Production behavior today is
// the same plain content-nodes grid as Sales/After Sales/IT Admin — see
// MIGRATION-NOTES.md's "Dead code observed" note for what was NOT ported.
export default function MarketingPanel() {
  return <CNSectionPanel sectionName="Marketing" title="Marketing" breadcrumb="Home › Marketing" />
}
