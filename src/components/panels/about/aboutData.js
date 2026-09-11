// Copied verbatim from old-portal/index.html's #panel-about — 100% static
// content, no data source. The "Brand Guidelines" section (#about-brand:
// brand colors, typography, logo rules, taglines) is intentionally NOT
// included here — it has no tab button anywhere and switchAbout() never
// reaches it (confirmed: switchAbout('brand') is never called anywhere in
// old-portal), so it's dead/orphaned content in production today.

export const STATS = [
  { value: '2011', label: 'Founded' },
  { value: '15+', label: 'Years of Excellence' },
  { value: '4', label: 'Office Locations' },
  { value: '8+', label: 'Certifications', link: 'certifications' },
]

export const CORE_VALUES = [
  { icon: '⭐', title: 'Excellence', desc: 'Setting high standards, continuously seeking to improve' },
  { icon: '🛡️', title: 'Reliable', desc: 'Trustworthy solutions, consistently delivering on promises' },
  { icon: '🤝', title: 'Commitment', desc: "Dedicated to customers' success and goals" },
  { icon: '💫', title: 'Service', desc: 'Exceptional service, going above and beyond' },
]

export const OUR_STORY = [
  "Aditi Tracking Support Pvt. Ltd. (ATSPL) was founded in 2011 by Chirag Rachh, who after losing his job at a telecom company decided to embark on an entrepreneurial journey. Driven by a passion for telematics and GPS technology, he founded Aditi Tracking with a single-minded focus on success.",
  'Since 2011, Aditi Tracking has established itself as a trusted name among the top GPS tracking companies in India, specialising in advanced GPS tracking solutions that help businesses monitor commercial fleets, reduce operational costs, and enhance safety.',
]

export const VISION =
  'To Become the Globally Trusted Partner for Businesses, Providing Advanced Telematics Solutions that Drive Operational Excellence, Cost Savings, and Sustainable Growth, while Delivering Unmatched Accuracy, Reliability, and Insight.'

export const MISSION =
  'Revolutionizing Connectivity with Advanced Telematics and IoT Solutions, We Are Committed to Delivering Excellence and Prompt, Reliable Service. From GPS fleet management to Cool Bus and ClickTask — innovation at every step.'

export const LOCATIONS = [
  {
    icon: '🏛️',
    name: 'Mumbai — Headquarters',
    badge: 'HQ',
    lines: ['Office No. 2,3 & 4,', '3rd Floor, Anupam Annapolis', 'Near Goregaon Railway Station', 'Goregaon East, Mumbai – 400063.'],
    phone: '+919637396373',
    phoneDisplay: '+91 96373 96373',
    mapUrl: 'https://maps.app.goo.gl/owoftmW8ufxLBqEQ7',
    mapLabel: '📍 View on Google Maps',
    accent: '#f0a500',
  },
  {
    icon: '🏖️',
    name: 'Goa',
    badge: 'Branch',
    lines: ['5th Floor, Office No. 507', 'Gera Imperium 1', 'EDC Patto Plaza, Opposite Hotel Ginger', 'Panaji, Goa - 403001'],
    mapUrl: 'https://www.adititracking.com/contact-us/',
    mapLabel: '📞 Contact Goa Office',
    accent: '#00d4aa',
  },
  {
    icon: '🏙️',
    name: 'Ahmedabad',
    badge: 'Branch',
    lines: ['B/h, Divya Bhaskar Press,', '608, 31 five building, Corporate Rd, Makarba', 'Ahmedabad, Gujarat 380051'],
    mapUrl: 'https://www.adititracking.com/contact-us/',
    mapLabel: '📞 Contact Ahmedabad Office',
    accent: '#a855f7',
  },
  {
    icon: '🏙️',
    name: 'Bangalore',
    badge: 'Branch',
    lines: [
      '7th Block, West, Jayanagar, 197,',
      '1st Floor, New No.15, Bsk Ii Stage, Bengaluru,',
      '4th Cross Road, Thyagaraj Nagar, Bangalore-560070, Karnataka',
    ],
    mapUrl: 'https://www.adititracking.com/contact-us/',
    mapLabel: '📞 Contact Bangalore Office',
    accent: '#a855f7',
  },
]

export const UPCOMING_OFFICES = ['Pune', 'Delhi', 'Kolkata']

export const MILESTONES = [
  { year: '2011', title: 'Birth of the Leader', desc: 'Chirag Rachh founded Aditi Tracking Support Pvt. Ltd. (ATSPL) in Mumbai after a decade in telecom. GPS tracking for commercial fleets was the core focus.' },
  { year: '2012', title: 'Geographic Expansion', desc: "Started operations in Pune, Nagpur & Indore — taking Aditi's telematics solutions beyond Mumbai." },
  { year: '2014', title: 'Government Partnerships', desc: 'Aditi partners with Government Projects, marking a major step towards large-scale fleet compliance solutions.' },
  { year: '2016', title: 'Fuel Monitoring Pioneer', desc: 'First to introduce Fuel Monitoring Solution — a breakthrough in reducing fuel theft and operational costs for fleets.' },
  { year: '2017', title: 'Global Recognition', desc: 'Franchise operations launched. Participated in Global EXPO events — Dubai, ZYTEX, HKTDC — establishing international presence.' },
  { year: '2018', title: 'Public Sector Vehicle Fleet', desc: 'Opportunity to work with 20+ PSVs (Public Service Vehicles) — expanding government & institutional client base.' },
  { year: '2019', title: 'Quality Certifications', desc: 'Acquired ISO Certification & CMMI Level 3 certification — validating process excellence and quality commitment.' },
  { year: '2020', title: 'AIS 140 Compliance', desc: 'Aditi Tracking gets AIS 140 Certified — government-mandated GPS standard for commercial vehicles in India.' },
  { year: '2021', title: 'Goa Operations Launch', desc: "Expanded to Goa, serving North & South Goa's growing commercial fleet market." },
  { year: '2022', title: 'Ahmedabad Office', desc: 'Launched Gujarat operations from Ahmedabad — strengthening West India presence.' },
  { year: '2023', title: 'Cool Bus Solution Launch', desc: 'Launched Cool Bus — an advanced school bus tracking and student safety solution, entering the education sector.' },
  { year: '2024', title: 'CommutePulse & WasteTrail', desc: 'Launched CommutePulse for employee transport tracking and WasteTrail for waste management fleet solutions.' },
  { year: '2026', title: 'Aditi Tracking Portal', desc: 'Internal Knowledge based portal launched — unified command centre to track, train and grow.' },
]

export const CERTIFICATIONS = [
  {
    icon: '📋',
    category: 'Quality Management System',
    title: 'ISO 9001:2015',
    accent: '#c0392b',
    fields: [
      ['Certifying Body', 'Paramount Quality Certifications'],
      ['Certificate No.', 'QM-50293/0125'],
      ['Issue Date', '14.01.2025'],
      ['Valid Upto', '13.01.2028'],
      ['Scope', 'Manufacture, Supply & Service of GPS Devices for Vehicle Tracking'],
    ],
    status: 'Active & Valid',
  },
  {
    icon: '🔒',
    category: 'Information Security Management System',
    title: 'ISO 27001:2022',
    accent: '#6c3483',
    fields: [
      ['Certifying Body', 'Paramount Quality Certifications'],
      ['Certificate No.', 'IM-50294/0125'],
      ['Issue Date', '14.01.2025'],
      ['Valid Upto', '13.01.2028'],
      ['Scope', 'Manufacture, Supply & Service of GPS Devices for Vehicle Tracking'],
    ],
    status: 'Active & Valid',
  },
  {
    icon: '⭐',
    category: 'Certificate of Compliance',
    title: 'CMMI Maturity Level — 5',
    accent: '#c0392b',
    fields: [
      ['Certifying Body', 'Paramount Quality Certifications'],
      ['Certificate No.', 'CM-50295/0125'],
      ['Issue Date', '14.01.2025'],
      ['Valid Upto', '13.01.2028'],
      ['Scope', 'Manufacture, Supply & Service of GPS Devices for Vehicle Tracking'],
    ],
    status: 'Active & Valid',
  },
  {
    icon: '🔵',
    category: 'Quality Management System',
    title: 'ISO 9001:2015 — TÜV Nord',
    accent: '#1a5276',
    fields: [
      ['Certifying Body', 'TÜV INDIA PVT. LTD.'],
      ['Certificate No.', 'QM 01 00898'],
      ['Issue Date', '07.07.2019'],
      ['Valid Until', '06.07.2022 (Upgraded)'],
      ['Scope', 'Manufacture, Supply and Service of GPS Devices for Vehicle Tracking'],
    ],
    status: 'Upgraded to PQC Certification',
    statusAccent: true,
  },
  {
    icon: '🚗',
    category: 'Certificate of Membership',
    title: 'Smart Mobility Association',
    accent: '#d35400',
    fields: [
      ['Issuing Body', 'Smart Mobility Association'],
      ['Membership No.', '201940-DM'],
      ['Company', 'Aditi Tracking Support Pvt. Ltd.'],
      ['Date of Joining', '29.04.2019'],
    ],
    status: 'Industry Member',
  },
  {
    icon: '🇮🇳',
    category: 'Govt. of India — #StartupIndia',
    title: 'Certificate of Recognition',
    accent: '#0b6623',
    fields: [
      ['Issuing Authority', 'Dept. for Promotion of Industry & Internal Trade'],
      ['Certificate No.', 'DIPP113215'],
      ['Date of Issue', '02-11-2022'],
      ['Valid Upto', '29-11-2031'],
      ['Sector', 'Telecommunication & Networking Industry'],
    ],
    status: 'Active & Valid',
  },
  {
    icon: '™',
    category: 'Trade Marks Registry, Govt. of India',
    title: 'Registered Trade Mark',
    accent: '#1a5276',
    fields: [
      ['Issuing Authority', 'Trade Marks Registry Mumbai'],
      ['Trade Mark No.', '5682943'],
      ['Date', '15-11-2022'],
      ['Class', 'Class 9 — Software'],
      ['Sealed On', '17th November, 2023'],
    ],
    status: 'Registered & Protected',
  },
  {
    icon: '📡',
    category: 'Govt. of India — Ministry of Communication & IT',
    title: 'DOT — OSP Registration',
    accent: '#17a589',
    fields: [
      ['Issuing Authority', 'Dept. of Telecom, Telecom Enforcement, Mumbai'],
      ['Registration No.', 'MUM/D/11557/1216'],
      ['Date', '20-12-2016'],
      ['Type', 'Domestic OSP Center at 511 Agarwal B2B Centre, Malad W, Mumbai'],
    ],
    status: 'Govt. Registered',
  },
]

export const CERT_BADGES = ['ISO Certified', 'CMMI Level 5', '#StartupIndia', 'Trademark Registered']
