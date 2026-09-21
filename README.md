# Sandstone internal portal

The Sandstone admin portal — Control, Operations, Recruitment, Employees,
Clients (CRM) and Intelligence — implemented from the Claude Design handoff
(`Sandstone Admin Portal.dc.html`) as a real application:

- **Frontend:** React + TypeScript (Vite), routed with `react-router`, styled
  with Sandstone's own design system tokens and `.sds-` component CSS
  (ported verbatim from the design bundle — see `src/styles/ds/`).
- **Backend:** a Cloudflare Worker (Hono) serving a small JSON API.
- **Data:** Cloudflare D1. There's no real business data yet, so the six
  domains (metrics, employees, clients, ops board/gantt, recruitment,
  intelligence feed) are seeded with the same fictional placeholder data the
  design prototype used — see `seed/seed.sql`. Swap that file for real
  records; the schema (`migrations/0001_init.sql`) doesn't need to change to
  do that.

## Local development

```bash
npm install
npm run db:migrate:local   # creates the local D1 schema
npm run db:seed:local      # loads the fictional demo data
npm run dev                # vite dev server with the Worker + D1 attached
```

Or run against the built Worker directly:

```bash
npm run build
npx wrangler dev
```

## Deploying

The D1 database (`sandstone-internal-portal`, see `wrangler.jsonc` for the
id) already exists in the Cloudflare account. This session had no
`wrangler login` credentials available, so deployment wasn't run — from a
machine with account access:

```bash
npm run db:migrate:remote
npm run db:seed:remote
npm run deploy
```

## Project layout

```
worker/         Cloudflare Worker (Hono) — GET /api/* routes over D1
shared/types.ts Types shared between the Worker and the React app
src/            React app (pages/, components/, lib/)
src/styles/ds/  Sandstone design system tokens + component CSS (ported as-is)
migrations/     D1 schema
seed/           Fictional placeholder data for the six data domains
```

## What's intentionally not wired up yet

The header action buttons (Raise work / Post a role / Add employee / New
account / Log an item) and the two personnel-file / client-record buttons
are static, matching the original prototype — it didn't wire them to any
action either. Building those out (forms + `POST`/`PATCH` endpoints) is a
follow-up once there's a real workflow to support, not a gap in this pass.
