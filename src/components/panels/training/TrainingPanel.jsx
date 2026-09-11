import CNSectionPanel from '../../shared/CNSectionPanel'

// Phase 1 of Training — the Videos tab only. Ported from old-portal/js/training.js's
// loadTrainingSection(): CN.getSection('Training') + a plain card grid, same
// generic pattern as Sales/After Sales/etc. Reuses CNSectionPanel/
// CNCategoryBrowser/FileViewerModal unchanged.
//
// Deliberately NOT included in this phase (see plan discussion +
// MIGRATION-NOTES.md): the Assessment/quiz tab (Phase 2: quiz-taking flow;
// Phase 3: MIS quiz creation/management + Grade Overlay). Old-portal's
// dead switchTrainingTab()/legacy hidden tab markup is not ported either —
// confirmed unreachable in production.
export default function TrainingPanel() {
  return <CNSectionPanel sectionName="Training" title="Training" breadcrumb="Home › Training" />
}
