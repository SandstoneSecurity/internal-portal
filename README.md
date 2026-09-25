# Sandstone internal portal

The Sandstone admin portal — Control, Operations, Recruitment, Employees,
Clients (CRM) and Intelligence — implemented from the Claude Design handoff
(`Sandstone Admin Portal.dc.html`) as a real application:

- **Frontend:** React + TypeScript (Vite), routed with `react-router`, styled
  with Sandstone's design system tokens and `.sds-` component CSS
  (`src/styles/ds/`) plus the portal layer in `src/styles/portal.css`.
  Motion uses [`motion`](https://motion.dev) (Framer Motion) with the house
  easing only: tweens, no springs or bounce. The survey-plate contour
  background is a three.js shader (`src/components/SurveyField.tsx`). It is
  lazy-loaded, capped at 30fps, pauses off-screen and stops for
  reduced-motion users.
- **Backend:** a Cloudflare Worker (Hono) serving a JSON API: reads plus
  validated writes (zod), each recorded in an audit log.
- **Data:** Cloudflare D1. Production starts empty; every figure on Control is
  computed from the records you keep (officers on shift, sites, open and
  past-due work, licences expiring in 90 days). `seed/seed.sql` holds the
  fictional demo data for local use only.

## Using the portal

- **Every button does something.** Raise work, Post a role, Add candidate,
  Add employee, Roster shift, New account, Add contact, Log activity, Record
  proposal and Log an item open a form drawer and save straight to D1. Records
  can be edited and deleted from their row menu or file panel.
- **Operations task board.** Three sections: To do, In progress and Complete.
  - **Cards** show the service line and priority tags, the assignee and the
    start–due dates. Past-due dates show in clay; dates due today or tomorrow
    show in eucalypt.
  - **Subtask progress** is shown on each card, and the subtasks expand in
    place.
  - **The tick** completes a task.
  - **"Add task"** at the foot of a section adds tasks inline.
  - **Dragging** moves a task between sections or reorders it within one.
  - **Opening a task** shows a panel that saves as you edit: name, assignee,
    dates, section, priority, service line, client/site and description.
    Subtasks there have their own assignee and start/due dates, and the panel
    also lists the task's activity.
  - **The timeline** draws each task and its subtasks as coloured bars.
- **Drag and drop** also moves candidates between Recruitment stages. Moves
  update the screen at once and roll back if the save fails.
- **Command palette:** press `Ctrl K` / `⌘K` or `/`. From there you can jump
  to any page, person, account, work item, role or intelligence item, run any
  action, switch theme, open the activity log or sign out. `N` starts the
  page's primary action.
- **Activity log.** The clock icon in the header shows every change: who made
  it, what it was, and when.
- **Themes.** The default is limestone (day). Operations mode is the night
  theme for the control room; toggle it from the header or the palette. The
  choice is remembered per browser.
- **Fonts** (Jost, Newsreader, Sandstone Text, Sandstone Mono) are
  self-hosted from `src/styles/ds/fonts/`, so there are no third-party font
  requests.

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

Pushing to `main` runs **Deploy to Cloudflare** (`.github/workflows/deploy.yml`).
It applies any new D1 migrations to the remote database, then builds and
deploys the Worker, using the `CLOUDFLARE_API` secret. The demo seed is never
loaded remotely.

## API

All routes need a valid Access JWT. Writes also need the header
`X-Sandstone-Portal: 1` and a same-origin `Origin` (the CSRF guard). Invalid
input returns `400 {error, fields}`.

| Method | Route | |
| --- | --- | --- |
| GET | `/api/portal` | Everything the app renders, with computed metrics |
| POST · PATCH · DELETE | `/api/work[/:id]` | Tasks (`columnId` moves a card, `position` places it within the section) |
| POST | `/api/work/:id/subtasks` | Add a subtask |
| PATCH · DELETE | `/api/subtasks/:id` | Edit, complete, reorder or remove a subtask |
| POST · PATCH · DELETE | `/api/employees[/:id]` | Personnel register |
| POST | `/api/employees/:id/shifts` | Roster a shift |
| POST · PATCH · DELETE | `/api/clients[/:id]` | Accounts |
| POST | `/api/clients/:id/contacts`, `/api/clients/:id/activity` | Contacts, activity |
| PUT · DELETE | `/api/clients/:id/deal` | Open proposal |
| POST · PATCH · DELETE | `/api/roles[/:id]`, `/api/candidates[/:id]` | Recruitment |
| POST · DELETE | `/api/intel[/:id]` | Intelligence feed |

Each write runs as one D1 batch together with its `audit_log` row.

## Access control

The portal sits behind **Cloudflare Access**. Access hosts the sign-in page
and emails a one-time code to confirm the address, and only
`william@sandstonesecurity.com` is allowed in. As a second layer, the Worker
(`worker/auth.ts`) checks the Access-signed JWT on **every** request,
including the app shell (`run_worker_first` in `wrangler.jsonc`). It checks
the signature, issuer, audience, expiry and email, and refuses anything else.
If Access is switched off, misconfigured, or the settings below are empty, the
portal returns "Access denied" rather than serving data.

Settings live in `wrangler.jsonc` → `vars`:

| Var | What |
| --- | --- |
| `ACCESS_TEAM_DOMAIN` | Zero Trust team domain, e.g. `sandstone.cloudflareaccess.com` |
| `ACCESS_AUD` | Application Audience (AUD) tag(s) of the Access application(s), comma-separated |
| `ALLOWED_EMAILS` | Comma-separated allow-list |

The Access side is configured from code: run **Actions → Configure Cloudflare
Access → Run workflow**. It uses `.github/scripts/cloudflare-access-setup.sh`
to create or update the self-hosted "Sandstone internal portal" application for
the portal's hostnames, with One-time PIN (emailed code) as the only login
method and a policy allowing exactly the emails in `ALLOWED_EMAILS`. It prints
the application's AUD tag, which belongs in `ACCESS_AUD`; that var takes a
comma-separated list if more than one Access app fronts the Worker. The workflow
uses the `CLOUDFLARE_ACCESS_API` secret, falling back to `CLOUDFLARE_API`. The
token needs "Access: Apps and Policies Edit" and "Access: Organizations,
Identity Providers, and Groups Edit".

To add someone, add their email to `ALLOWED_EMAILS`, merge, then re-run the
Configure Cloudflare Access workflow. "Sign out" in the header ends the
Access session (`/cdn-cgi/access/logout`).

Local `npm run dev` / `wrangler dev` has no Access in front of it, so every
request is refused there too. There's deliberately no bypass switch that
could be left on in production.

## Project layout

```
worker/         Cloudflare Worker (Hono): auth, reads (db.ts), writes (writes.ts)
shared/types.ts Types shared between the Worker and the React app
src/            React app (pages/, components/, actions/, lib/)
src/styles/ds/  Sandstone design system tokens + component CSS (ported as-is)
migrations/     D1 schema (0002: dates, audit log, regions; 0003: three-section board, task fields, subtasks)
seed/           Fictional demo data for local development
```
