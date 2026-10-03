# Architecture

## Overview

```
 Browser (React SPA, GitHub Pages)
    |-- Supabase JS client --> Supabase (Postgres + RLS, Storage, Edge Functions)
    |-- fetch --------------> Flask API on Railway (permissions, mapping, field-service helpers)
    '-- fetch --------------> Google Apps Script endpoints (Enterprise Lead, IMS)

 Railway background jobs --> Supabase   (SmartFleet sync, Odoo leads sync)
 Supabase Edge Function  --> Resend     (daily birthday-reminder email to HR)
```

## Frontend

- **Entry:** `src/main.jsx` mounts `App.jsx`, which wraps the app in `AuthProvider`
  and renders `LoginPage` or `PortalShell` depending on whether a user is signed in.
- **Shell:** `components/shell/PortalShell.jsx` owns the layout (desktop sidebar,
  mobile header, bottom nav and menu sheet). `shell/navItems.js` is the single source
  of truth for navigation and per-item visibility rules, shared by desktop and mobile.
- **Panels:** each module lives in `components/panels/<module>/` and is a
  self-contained panel with its own tabs, modals and tables.
- **Data access:** panels do not talk to Supabase directly. Each feature has a
  matching module in `src/lib/` (for example `fms.js`, `renewals.js`,
  `dealPricing.js`) that owns queries, mutations and business rules.
  `lib/supabaseClient.js` creates the shared client.
- **Shared building blocks:** `shared/` holds the file viewer, upload modal,
  category browser for content-node driven pages, searchable select, a fixed-row-height
  table, and an error boundary.
- **Contexts and hooks:** contexts hold auth and cross-panel navigation state
  (renewals, task checklist, task delegation); hooks provide theming, chart themes
  and attachment/screenshot caching.

## Access control

Visibility is role- and permission-driven.

- Users sign in and receive a role plus a set of permission flags
  (e.g. `can_view_leads`, `can_view_fms`).
- `lib/permissions.js` and the per-feature `can*` helpers decide what each user sees.
  `navItems.js` applies these to the sidebar and the Dashboards hub.
- Owners get broad defaults; the MIS role can edit permissions through the
  Access Control panel, which calls the Flask API.
- Supabase Row Level Security enforces the same boundaries at the database,
  so hiding a nav item is never the only protection.

## Backend (`backend/`)

| File | Role |
| --- | --- |
| `api.py` | Flask API using the Supabase service-role key. Handles permission lookup and edits, customer-mapping data and saves, Odoo search, field-service engineer names, checklist task generation, and `/health`. |
| `smartfleet_sync.py` | Long-running scheduled loop that syncs SmartFleet lead data into Supabase. |
| `odoo_leads_sync.py` | Incremental, stateless Odoo CRM leads sync intended to run as a Railway cron job; state lives in a `sync_state` table. |
| `Procfile` | Starts the API with gunicorn on Railway. |

## Supabase Edge Functions

- `send-birthday-reminder` - finds employees whose birthday is tomorrow and emails HR
  so they can prepare celebration creatives. Sends nothing when there are none.

## Build and deployment

- `vite build` outputs to `dist/`, published with `npm run deploy` (gh-pages).
- `vite.config.js` uses `base: '/'` because the custom domain serves the app at the root.
- The backend is deployed separately on Railway; secrets are set there, never committed.
- Push notifications use OneSignal via `public/OneSignalSDKWorker.js`.
