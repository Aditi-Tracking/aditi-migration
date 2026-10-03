# Aditi Portal

Internal employee portal for Aditi Tracking, served at <https://learn.adititracking.com>.
It brings HR content, sales and after-sales resources, operational dashboards and
workflow tools into a single role-aware web app.

The portal was migrated from a hand-written multi-file HTML/JS site to a React
single-page app. The migration is complete and the project is in maintenance mode.

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, Vite, Tailwind CSS 4 |
| Charts / diagrams | Chart.js (+ datalabels), React Flow (`@xyflow/react`) with dagre layout |
| Data / auth | Supabase (Postgres, Row Level Security, Storage, Edge Functions) |
| Backend services | Python (Flask API + scheduled sync jobs), deployed on Railway |
| Notifications | OneSignal web push, Resend (email) |
| Hosting | GitHub Pages with a custom domain (`public/CNAME`) |

## Getting started

Prerequisites: Node.js 20+ and npm.

```bash
npm install
cp .env.example .env     # then fill in your Supabase values
npm run dev              # start the Vite dev server
```

| Script | Purpose |
| --- | --- |
| `npm run dev` | Local dev server with hot reload |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Run ESLint |
| `npm run deploy` | Publish `dist/` to GitHub Pages |

### Environment variables

Frontend variables live in `.env` (never committed; see `.env.example`):

- `VITE_SUPABASE_URL` - Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Supabase anon (public) key

The backend reads `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` from the host's
environment (Railway). The service key must never be placed in frontend code.

## Repository layout

```
src/
  components/
    shell/      Sidebar, mobile nav, profile modal, toasts, nav item definitions
    panels/     One folder per portal module (FMS, Field Service, HR, ...)
    shared/     Reusable UI: file viewer, upload modal, tables, overlays
  context/      Auth, celebrations, file viewer and navigation contexts
  hooks/        Theme, chart theme, attachment and screenshot caches
  lib/          Data-access and business-rule modules, one per feature
backend/        Flask permissions API and Supabase sync scripts
supabase/       Edge Functions (e.g. birthday reminder email)
public/         Static assets, push-notification service worker, CNAME
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md) - how the pieces fit together
- [Modules](docs/MODULES.md) - what each portal module does and who can see it
- [MIGRATION-NOTES.md](MIGRATION-NOTES.md) - historical record of the old-portal to React conversion
