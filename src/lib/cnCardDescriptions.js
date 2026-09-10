// Ported from old-portal/js/shared.js's CN_CARD_DESCRIPTIONS/getCNCardDesc —
// used by every dynamic content-nodes card across modules (HR's SOP/Mediclaim/
// HR Policy cards now, Sales/After Sales/Training/etc. later).
const CN_CARD_DESCRIPTIONS = {
  // HR
  sop: 'Standard Operating Procedures — step-by-step documented processes to ensure consistent and efficient operations.',
  mediclaim:
    'Employee health insurance documents — claim forms, policy details, coverage information and reimbursement guidelines.',
  'hr policy':
    'Company HR policies — leave rules, attendance guidelines, code of conduct and employee benefits information.',
  'organization chart':
    'Complete team structure of Aditi Tracking — departments, roles and reporting hierarchy across all offices.',
  directory: 'Employee, Support & Vendor directories — contacts, roles and resources all in one place.',
  'branch office':
    'Branch office details — location, contacts, team structure and operational information for all branches.',
  'holiday list': 'Company holiday calendar — upcoming holidays, branch-wise list and next holiday countdown.',

  // Sales
  'target audience':
    'Customer profiles and segmentation — understand who to target, buyer personas and effective approach strategies.',
  'qualify leads': 'Lead qualification framework and SQL criteria — know when a prospect is truly ready to buy.',
  'sales pitch':
    'Ready-to-use pitch scripts and presentation decks — present Aditi Tracking value proposition with confidence.',
  'objection handling':
    'Common objections and proven responses — turn customer hesitations into opportunities and close more deals.',
  'intro and follow up':
    'Introduction scripts and follow-up message templates — make the right first impression and stay top of mind.',
  'intro & follow-up':
    'Introduction scripts and follow-up message templates — make the right first impression and stay top of mind.',

  // After Sales
  'api docs':
    'Technical API documentation — integration guides, endpoint references and developer resources for Aditi systems.',
  'hardware configuration':
    'Hardware setup and configuration guides — device installation, calibration, troubleshooting and maintenance steps.',

  // Training
  'mis training':
    'Management Information System training — reports, dashboards, data analysis and MIS workflows for the team.',
  'odoo training': 'Odoo ERP system training — modules, workflows, daily operations and best practices across all departments.',
  'pc training': 'Process Coordinator training — coordination workflows, closing procedures and client follow-up best practices.',
  'click task training':
    'Click Task app training — task creation, assignments, tracking and completion workflows for field teams.',
  'cool bus training': 'Cool Bus operations training — booking management, customer service and operational procedures.',
  'smart fleet training': 'Smart Fleet monitoring training — GPS tracking, fleet operations, alerts and reporting dashboards.',
  'pre-sales training': 'Pre-Sales process training — lead handling, CRM pipeline management and opportunity conversion techniques.',

  // IT & Admin
  'company docs & certifications': 'ISO certificates, company registrations, GST, EPFO, ESIC, NSIC and all official government documents.',
  'company docs and certifications': 'ISO certificates, company registrations, GST, EPFO, ESIC, NSIC and all official government documents.',
  "nda's": 'Non-Disclosure Agreements — confidential contracts with employees, clients and business partners.',
  ndas: 'Non-Disclosure Agreements — confidential contracts with employees, clients and business partners.',
  '2025 iso certificates': 'Latest ISO certification documents — quality management and compliance certificates valid for 2025.',
  'company docs': 'Core company documents — registrations, licences and official records.',
  'gst epfo esic certification': 'GST, EPFO & ESIC statutory compliance certificates and related government filings.',
  'nsic certificate 25-27': 'National Small Industries Corporation certificate — valid 2025 to 2027.',
  'prof tax & certificate': 'Professional tax registration and related compliance certificates.',

  // Finance
  invoices: 'Client and vendor invoices — billing records, payment status and invoice tracking.',
  budgets: 'Annual and quarterly budget documents — expense plans, allocations and financial targets.',
  reports: 'Financial reports — monthly P&L, balance sheets and expense summaries.',
  expenses: 'Company expense records — reimbursements, petty cash and department-wise spending.',

  // Referral
  'referral policy': 'Employee referral programme policy — eligibility, reward structure and referral submission process.',
  'referral forms': 'Referral submission forms and tracking sheets for the employee referral programme.',
}

export function getCNCardDesc(name) {
  const key = (name || '').trim().toLowerCase()
  if (CN_CARD_DESCRIPTIONS[key]) return CN_CARD_DESCRIPTIONS[key]
  for (const k of Object.keys(CN_CARD_DESCRIPTIONS)) {
    if (key.includes(k) || k.includes(key)) return CN_CARD_DESCRIPTIONS[k]
  }
  if (key.includes('training') || key.includes('video'))
    return `${name} training materials — videos, guides and learning resources for the team.`
  if (key.includes('policy') || key.includes('policies')) return `${name} — guidelines, rules and procedures to follow.`
  if (key.includes('report') || key.includes('mis')) return `${name} — reports, data and analysis documents.`
  if (key.includes('form') || key.includes('template')) return `${name} — ready-to-use templates and forms.`
  if (key.includes('doc') || key.includes('cert')) return `${name} — official documents and certificates.`
  return `${name} — all related files, documents and resources in one place.`
}
