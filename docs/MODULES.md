# Portal Modules

Navigation is defined in `src/components/shell/navItems.js`. Most items are shown
only to users whose role or permission flags allow it.

## Dashboards hub

The "Dashboards" item opens a tile grid; each tile appears only if the user has access.

| Module | Purpose |
| --- | --- |
| SmartFleet | Sales lead-funnel dashboard |
| Enterprise Solutions | License-deployment dashboard for enterprise products |
| Enterprise Lead | Enterprise lead tracking |
| Renewals & Collections | Renewal and collection workflow: customers, call logging, closed/paid, unassigned pool, upload, overview, team performance, accounts and notes |
| Collections & Repeat Orders | Collections and repeat-order dashboard |
| FMS O2D | Order-to-delivery pipeline: new orders, timeline and notes, engineer/support assignment, payment, installation and certification updates, duplicate order |
| Task Checklist | Per-employee checklists plus a Task Scheduler tab |
| IMS | Inventory management view across locations |
| Customer Mapping | Map customers to CRM records |
| CRM Vehicle | GPS fleet tracking view |
| Field Service | Submit service entries with photos, browse entries, KPI dashboard with click-to-filter charts |
| HR Employee Master | Employee master data |
| Task Delegation | Delegate and track tasks between employees |

## Content and knowledge sections

Most of these are driven by the shared `content_nodes` model, so categories and
documents can be managed without code changes.

| Section | Notes |
| --- | --- |
| Home | Welcome header, employee profile banner, celebrations, shortcuts |
| About Organisation | Overview, locations, milestones, certifications |
| HR | SOPs, Mediclaim, HR policy, org chart (editable, React Flow), directory, holiday list |
| Sales | Sales SOPs and enablement material |
| After Sales | After-sales documents |
| Finance | Finance documents |
| Products | Product information |
| Marketing | Marketing media |
| IT & Admin | IT and admin resources |
| Training | Training videos and material |
| Documents | Company documents, with a role-based layout |

## Tools and administration

| Module | Notes |
| --- | --- |
| Deal Pricing Calculator | GST-split floor pricing, accessories catalog, state-specific products, searchable dropdowns, on-screen quote preview, My Quotes history, cost master |
| Vendor Requests | Purchase approval workflow and recurring bills |
| Referral | Permission-gated referral tabs |
| Activity Log | Reporting on user activity across the portal |
| Access Control | MIS-only editor for user permissions |
| Celebrations | Birthday and anniversary detection and wishes, plus an HR reminder email |

## Cross-cutting features

- Light and dark themes with chart theming
- Mobile layout with bottom navigation and menu sheet
- Universal file upload, viewing and deletion
- OneSignal push notifications
- Idle-session warning and greeting toasts
- Activity tracking on page switches
