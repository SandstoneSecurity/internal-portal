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
  validated writes (zod).
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
  - **The timeline** is an interactive Gantt chart:
    - **Colours:** bars and board sections share one progress palette. To do
      is jacaranda, in progress harbour, waiting on another task ochre, past
      due clay and complete eucalypt. Subtask completion fills each task's bar.
    - **Editing dates:** drag a bar to move it, or drag either end to change
      its start or due date. Arrow keys nudge a focused bar by a day (Shift
      changes the due date only). Subtask bars work the same way.
    - **Scheduling:** click an empty row to schedule an undated task.
    - **Scrolling:** the view scrolls endlessly across months. There are
      Today and previous/next buttons, and Days / Weeks / Months zoom.
      Dragging empty space pans the view.
    - **Milestones** are diamonds with a single date. Add them from the
      toolbar, or switch any task's Type in its panel.
    - **Dependencies:** drag the dot at the end of a bar onto another bar to
      make that task wait on this one, or use the Dependencies section in the
      task panel. Arrows join linked tasks; a dashed red arrow means the
      dependent starts before its predecessor is due. Loops are refused.
- **People → Recruitment (applicant tracking, in the style of Workable):**
  - **Jobs list:** each job shows its state (Draft, Published, On hold,
    Closed) and candidate counts for all seven pipeline stages. Those stages
    are Sourced, Applied, Phone screen, Licence check, Interview, Offer and
    Hired; clicking a count opens the job at that stage.
  - **Job page:** a stage bar, a list/profile split view and a drag-and-drop
    pipeline board.
  - **Candidate profiles:** contact details, licence (SLED) status, a stage
    stepper and a "Move to next stage" button. You can also disqualify a
    candidate (with a reason) or requalify them.
  - **Tabs on each profile:** the CV, a timeline of everything that
    happened, star-rated scorecards (the average becomes the candidate's
    rating) and team comments.
  - **CVs:** the careers site stores each CV sent with an application in
    D1 (`careers_cv_files`, with the bytes split across `careers_cv_chunks`).
    The CV tab shows PDFs and images in place, with Open and Download; other
    types (Word, for example) download. A paperclip in the candidate list
    marks who has one. Deleting a candidate or job deletes their files.
- **Clients (a CRM in the style of HubSpot):**
  - **Companies:** a sortable, searchable table with saved views (all, mine,
    and one per lifecycle stage: Lead, Opportunity, Customer, Former
    customer).
  - **Company record, left column:** properties you edit in place, plus
    quick-log buttons.
  - **Company record, middle column:** an activity timeline for notes,
    emails, calls (with outcome), meetings and tasks (with due dates and
    completion). Upcoming tasks are pinned at the top.
  - **Company record, right column:** contacts (email and phone) and deals.
  - **Deals:** a pipeline board (Enquiry → Site survey → Proposal sent →
    Negotiation → Closed won or lost) with stage totals, win probabilities
    and a weighted forecast. Dragging a deal to Closed won makes the company
    a Customer, and an open deal lifts a Lead to Opportunity.
- **Threat Modelling (risk quantification across physical, personnel and cyber):**
  - **Portfolio:** every client ranked by expected annual loss, with its mix
    by domain, its 1-in-10-year loss and its top risk.
  - **Guidance:**
    - A four-step "How it works" strip, which can be hidden.
    - A setup checklist on each client, showing what the model still needs
      and the next step.
    - "i" hints beside every figure and column that explain it in plain
      English: a small square brass-edged button whose popover carries a
      title and points back at it.
    - A Guide drawer with the steps, how to read the numbers, how to build
      a site model (with keyboard shortcuts), where the figures come from,
      and a glossary. Definitions live once, in `src/pages/risk/Guide.tsx`.
  - **Risk profile per client:**
    - Expected loss a year, with and without controls, and the 1-in-10 and
      1-in-100-year losses.
    - A loss exceedance curve (the chance a year's losses pass each dollar
      amount) for no controls, controls in place, and with planned and
      proposed controls.
    - A 5×5 likelihood × consequence matrix and loss by domain.
  - **Register:** every scenario with how often it happens, the loss per
    event (range and most likely), the chance a year, the rating, and the
    expected loss before and after controls. Open a row to override the rate
    or loss, or to aim it at an asset.
  - **Controls:** status (In place, Planned, Proposed), cost, how well it's
    implemented, the loss it removes each year and its return on security
    investment (ROSI). "Best value next" ranks library controls by loss
    removed per dollar.
  - **Incidents:** real incidents calibrate the model. Each scenario's
    frequency moves from the library's reference rate towards the client's
    own history (Gamma–Poisson credibility; the reference rate counts as
    three years of evidence).
  - **Sites:** several per client, each with levels.
    - **Plan:** upload a floor plan as a PDF, PNG, JPEG or WebP. PDF pages
      are rendered at 3,200 px (pdf.js, loaded only when needed), so
      architects' vector drawings stay sharp. Scanned drawings decode too:
      pdf.js's JPEG 2000 and JBIG2 decoders and standard fonts are served
      from `/pdfjs/` (copied from the package at build, see
      `vite.config.ts`). A site with no levels gets its first level from
      the upload.
      - **Several levels in one drawing** (`src/lib/planImport.ts`): each
        PDF page, and each separate plan drawn side by side on a sheet,
        becomes a candidate level.
        - Names and bottom-to-top order come from the drawing's titles
          ("GROUND FLOOR PLAN", "LEVEL 1", "BASEMENT 2", "MEZZANINE"). A
          title matching an existing level fills that level.
        - A review dialog shows thumbnails, names, order and what was
          found; each plan is cropped, scaled from its doors and given its
          walls.
        - Separate buildings on one site plan (a gatehouse beside a
          warehouse) stay one level; so do elevations and sections, which
          are offered unticked.
      - **Scale:** measure a wall of known length, or accept the scale that
        wall detection suggests from door widths. Lengths read "≈" until the
        scale is set.
      - **Walls:** "Detect walls" finds walls, doors (by their swing arc)
        and windows (by their glazing lines) on the plan
        (`src/lib/wallDetect.ts`). It separates wall strokes from text and
        furniture by stroke width and connectivity, reads solid or outlined
        walls, and snaps corners. Results show as a preview to accept or
        tune.
      - **Drawing:** the Wall tool snaps to corners and right angles, and
        takes typed lengths. Door and Window place openings on a wall.
        Select to move ends (shared corners move together), edit type,
        thickness and height, or delete. Undo and redo cover every change.
        Zoom with Ctrl-scroll or pinch.
      - **Model layers:** drag out zones, click to place assets and entry
        points, drag to move them. Dropping an asset into a zone files it
        there.
    - **Cameras:** click to place, click again to aim. Set lens, resolution,
      mounting height, tilt and range; 2.8–25 mm, fisheye and PTZ presets.
      - **Coverage:** what each camera sees is shaded on the plan and in 3D
        in the four IEC 62676-4 DORI bands (identify 250 px/m, recognise
        125, observe 62.5, detect 25). Walls and closed doors block the
        view; glass, windows and open doorways don't.
      - **Summaries:** the inspector lists the distance each band reaches
        and the zones and entry points the camera covers. The level summary
        gives zone coverage and entries identified.
    - **3D:** built from the walls. Thicknesses and heights are real; door
      and window openings are cut out, doors stand ajar, and glazing is
      transparent. A cutaway (with a cut-height slider) shows the rooms, or
      switch to full height. Also: shadows, coverage on the floor, and
      camera bodies with their view frustums. "View through camera" shows
      the camera's picture as an inset or full view. Levels stack with
      adjustable spacing.
    - **Attack paths:** derived rather than hand-drawn, running threat →
      entry point → zone → asset. Physical threats use physical entries and
      cyber threats use network and remote access. Line weight is expected
      loss, and each threat shows the controls in place as barriers.
  - **Location (NSW):** give a site its council area (LGA) and its
    crime-driven threats are sized from BOCSAR's recorded crime rates for
    that LGA against the NSW rate, per offence:
    - **Break-in:** non-dwelling break and enter (dwelling break and enter
      for residential sites).
    - **Retail theft:** steal from retail store.
    - **Robbery:** all robbery kinds combined.
    - **Vandalism and arson:** malicious damage to property.
    - **Vehicle theft:** motor vehicle theft.
    - **Staff assault:** non-domestic assault.

    Rates are per resident, so business districts read high; factors are held
    between ×0.25 and ×6. Each site shows its crime profile: the council
    area and period on one line, then each offence as a bar either side of
    the NSW rate (clay above, eucalypt below). Threats without
    a matching offence (protest, terrorism, hazards, cyber) take ×1. The
    manual crime factor scales only crime-driven threats, and only where no
    LGA data applies.
  - **Library:** 71 threats and 66 controls. Each threat has a reference
    rate, a loss range by organisation size, and the evidence behind them;
    each control has what it reduces and by how much.
    - Physical: property and violent crime, disorder, unauthorised access,
      threats and hoaxes, espionage, terrorism and hazards.
    - Personnel: violence and aggression, psychosocial harm, insider threat,
      integrity, vetting, safety, travel and targeted threats.
    - Cyber: fraud, account compromise, intrusion, extortion, data breach,
      third parties, availability and sabotage.
  - **Adding threats:** one searchable list, filtered by domain. Each
    threat is priced for the client (size, and each site's type and
    location), ranked by expected cost, with a chip for each site where it
    applies. "Select recommended" picks the threats that make up 80% of the
    expected cost.
- **Drag and drop** updates the screen at once and rolls back if the save
  fails.
- **Command palette:** press `Ctrl K` / `⌘K` or `/`. From there you can jump
  to any page, person, account, work item, role or intelligence item, run any
  action, switch theme or sign out. `N` starts the
  page's primary action.
- **Themes.** The default is limestone (day). Operations mode is the night
  theme for the control room; toggle it from the header or the palette. The
  choice is remembered per browser.
- **Fonts** (Jost, Newsreader, Sandstone Text, Sandstone Mono) are
  self-hosted from `src/styles/ds/fonts/`, so there are no third-party font
  requests.

## Risk quantification: method and sources

The engine (`shared/risk.ts`) follows FAIR (Factor Analysis of Information Risk):

- **Frequency:** a PERT range (low, most likely, high) of events a year. The
  library rate is scaled by exposure: per site × site-type factor × local
  crime factor, per 100 staff, or per organisation.
- **Loss per event:** a PERT range in AUD, chosen by organisation size (ABS
  bands: small under 20 staff, medium 20–199, large 200+). It is capped at an
  asset's value for theft and damage.
- **Controls:** each cuts a threat's frequency and/or loss by a fraction,
  scaled by implementation quality. Several controls combine
  multiplicatively. Site controls act at their site; organisation controls
  act everywhere.
- **Simulation:** 4,000 simulated years with a fixed seed, so results are
  repeatable. Expected losses are also computed exactly.
- **Calibration:** posterior rate = (λ₀·3 + incidents) ÷ (3 + years of
  history).
- **Ratings:** likelihood is the chance of at least one event a year.
  Consequence compares a typical event with revenue when it's known, and
  otherwise with dollar bands.

Each threat's rate and loss are labelled **anchored** (derived from a cited
Australian figure, with the arithmetic shown in the library) or
**estimated** (an analyst starting point for incident data to recalibrate).
Anchors:

- **ASD Annual Cyber Threat Report 2024–25:**
  - 84,700+ cybercrime reports.
  - Average cost per business report: $56,600 small, $97,200 medium,
    $202,700 large. Cyber loss curves are fitted so their mean equals these
    averages.
  - Business email compromise is 15% of business cybercrime.
- **OAIC Notifiable Data Breaches, 2025:** 1,205 notifications, 59% malicious.
- **IBM Cost of a Data Breach 2025 (Australia):** average AUD 4.22M.
- **NSW BOCSAR, 12 months to September 2025:** 7,971 non-dwelling break and
  enters. Divided by ≈320,000 NSW employing businesses (from ABS Counts of
  Australian Businesses, June 2025: 999,161 employing nationally), this gives
  ≈0.025 a year per business.
- **Safe Work Australia:**
  - Assault claims ≈5,300 a year, or ≈0.036 per 100 workers.
  - 17,600 serious mental-health claims in 2023–24; the median mental-health
    claim is $67,400, against $16,300 across all serious claims.
- **PwC Global Economic Crime and Fraud Survey 2020 (Australia):** 35% of
  organisations hit by fraud in 24 months.
- **ASIO:** the national terrorism threat level is PROBABLE.
- **Retail crime:** ARA/NRA and Griffith University retail crime figures.

Control costs are indicative Sydney prices, to be replaced with quotes when
applying a control. The library is data in `shared/threatLibrary.ts`: to
update a figure, change it there, cite the source and run the engine tests.

## NSW crime statistics

`worker/crime.ts` loads BOCSAR's **Local area rankings** workbook, which has
rates per 100,000 by LGA.

- **Automatic:** a cron trigger checks every 10 minutes and downloads weekly,
  or every six hours while a download is failing. Changing the parser version
  forces an immediate retry.
- **Manual:** use **Refresh from BOCSAR**, or **Upload workbook** with a copy
  downloaded from BOCSAR.
- **Parsing:** the parser reads the xlsx directly (zip + XML) and finds the
  LGA column and the rate column for each offence from the header rows. It
  handles wide layouts (per-offence column groups, several years; the latest
  year wins) and long layouts (one row per LGA and offence). If there is no
  NSW row, it derives the NSW rate from counts.
- **Diagnostics:** every attempt records the sheets, header rows and matched
  columns in `crime_meta.detail`, so a change in BOCSAR's layout can be
  diagnosed.

## People

Employees and Recruitment are one module, **People**, at
`/people?view=employees|recruitment`. The old `/employees` and
`/recruitment` addresses redirect, keeping their parameters.

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
| POST | `/api/work/:id/dependencies` | `{ dependsOn }`: this task waits on another (loops refused) |
| DELETE | `/api/work/:id/dependencies/:dependsOn` | Remove a dependency |
| POST · PATCH · DELETE | `/api/employees[/:id]` | Personnel register |
| POST | `/api/employees/:id/shifts` | Roster a shift |
| POST · PATCH · DELETE | `/api/clients[/:id]` | Companies |
| POST · PATCH · DELETE | `/api/clients/:id/contacts`, `/api/contacts/:id` | Contacts |
| POST · PATCH · DELETE | `/api/clients/:id/activity`, `/api/activity/:id` | Notes, emails, calls, meetings, tasks |
| POST · PATCH · DELETE | `/api/deals[/:id]` | Deals (`stage`, `position`) |
| POST · PATCH · DELETE | `/api/roles[/:id]` | Jobs |
| POST · PATCH · DELETE | `/api/candidates[/:id]` | Candidates (`stage`, `disqualified`, `disqualifyReason`) |
| POST | `/api/candidates/:id/comments`, `/api/candidates/:id/evaluations` | Comments, scorecards |
| DELETE | `/api/candidate-events/:id` | Delete a comment or scorecard |
| GET | `/api/files/:id[?download=1]` | A candidate's CV, reassembled from its chunks and checked against its SHA-256 |
| POST · DELETE | `/api/intel[/:id]` | Intelligence feed |
| POST | `/api/clients/:id/sites` | Add a site (it starts with a ground floor) |
| PATCH · DELETE | `/api/sites/:id` | Edit or delete a site and everything modelled at it |
| POST · PATCH · DELETE | `/api/sites/:id/levels`, `/api/levels/:id` | Levels (stack order, height, plan width in metres) |
| PUT · DELETE | `/api/levels/:id/plan?w=&h=&name=` | Floor plan, as the raw image body (PNG, JPEG or WebP, up to 8 MB, checked by its bytes) |
| GET | `/api/plans/:id` | A floor plan image |
| PUT | `/api/levels/:id/geometry` | A level's walls and openings, saved whole (points as plan fractions, sizes in metres) |
| POST · PATCH · DELETE | `/api/sites/:id/cameras`, `/api/cameras/:id` | Cameras (position, height, yaw, tilt, field of view, resolution, range) |
| POST · PATCH · DELETE | `/api/sites/:id/elements`, `/api/elements/:id` | Zones, assets and entry points (positions as fractions of the plan) |
| POST · PATCH · DELETE | `/api/clients/:id/scenarios`, `/api/scenarios/:id` | Scenarios (library `threatKey` or `custom`; rate and loss overrides) |
| POST | `/api/clients/:id/scenarios/bulk` | Several library threats at once; duplicates skipped |
| POST · PATCH · DELETE | `/api/clients/:id/controls`, `/api/tm-controls/:id` | Controls applied (status, costs, effectiveness) |
| POST · PATCH · DELETE | `/api/clients/:id/incidents`, `/api/incidents/:id` | Observed incidents |

Writes that touch several rows run as one D1 batch, so they apply in full or not at all.

Files are sent with `X-Content-Type-Options: nosniff` and
`Cache-Control: private, no-store`. Only PDFs (which must start with `%PDF-`)
and PNG, JPEG, GIF or WebP images display in the browser. Anything else is sent
as an `application/octet-stream` attachment under a sandboxing CSP, so an
uploaded HTML file can never run on the portal's origin.

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
worker/         Cloudflare Worker (Hono): auth, reads (db.ts), writes (writes.ts), files (files.ts), threat modelling (threats.ts)
shared/threatLibrary.ts, shared/risk.ts, shared/crime.ts  Threat and control library; quantification engine; NSW crime location factors
shared/geometry.ts, shared/cameras.ts                    Walls and openings; camera optics, DORI and coverage with occlusion
src/lib/wallDetect.ts                                    Wall, door and window detection on raster plans
shared/types.ts Types shared between the Worker and the React app
src/            React app (pages/, components/, actions/, lib/)
src/styles/ds/  Sandstone design system tokens + component CSS (ported as-is)
migrations/     D1 schema (0002: dates, audit log, regions; 0003: three-section board, task fields, subtasks; 0004: milestones, dependencies; 0005: applicant tracking and CRM; 0006: CV tables shared with the careers site; 0007: drops the audit log, as the portal has one user; 0008: threat modelling; 0009: NSW crime statistics and site LGAs; 0010: level geometry, plan scale and cameras)
seed/           Fictional demo data for local development
```
