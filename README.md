# eXplicit

This **README** (repository root) is the only project doc: the eXplicit real-estate feeds compliance web app—what it does, how it is structured, how to run and deploy it, and how docs sync from Google Drive.

---

## 1. What this project is

**eXplicit** is a single-page **real estate feeds compliance assistant**:

- **Chat:** Answers user questions using only the compliance documentation loaded from disk (not general web knowledge). The UI sends questions with `region: 'all'`, so answers draw from **all jurisdictions** that have content.
- **Document library (DOCS tab):** Browse parsed sections by **jurisdiction** (Canada, USA, Puerto Rico, Mexico), **category**, and search.
- **Optional upload API:** `POST /api/upload` can replace in-memory docs for a region (multer, max ~25 MB per request). Primary source of truth in production is usually **`documents/`** on disk plus optional Drive sync.

  **Upload vs fixture JSON (not the same thing):**

  - **`POST /api/upload`** only updates the **running server’s memory** (`store` for that region). It does **not** write to `documents/` and does **not** refresh `web/test/fixtures/*.json`. After a **server restart**, the app reloads from **`documents/`** unless those files were changed separately.
  - **Fixture JSON refresh** is done by **`npm run fixtures:generate`** (`web/scripts/generate-fixtures.js`), which reads **`documents/`** and regenerates **`web/test/fixtures/`**. The GitHub Drive sync workflow downloads into `documents/` and then runs that script so fixtures stay aligned with the source docs.

Jurisdictions are keyed in code as: `canada`, `usa`, `puerto_rico`, `mexico` (API and filters). Puerto Rico files live under **`documents/puerto rico/`** (folder name with a space on disk).

---

## 2. Tech stack

| Layer | Technology |
|--------|------------|
| Runtime | **Node.js** (ES modules, `type: "module"`) |
| Server | **Express** (`web/server.js`) |
| Frontend | Static **HTML / CSS / JS** in `web/public/` (no React build step) |
| AI (chat) | **OpenAI** API, streaming (`gpt-4o-mini` by default). **`OPENAI_API_KEY`** is required for chat; `GEMINI_API_KEY` may appear in `.env.example` but **chat in `server.js` currently uses OpenAI only**. |
| Docs parsing | `web/docs-parser.js` — `.txt`, `.md`, `.pdf` via `pdf-parse`; sections + HTML for the library |
| Compliance tests | **Playwright** (`web/test/`, `zoocasa.compliance.spec.js`) — targets external site, not the local app |
| Drive sync | **googleapis** + GitHub Actions (`web/scripts/download-drive-docs.js`) |
| Fixture checks | **`npm run test:fixtures`** — validates `web/test/fixtures/{canada,usa,mexico,puerto_rico}.json` (offline, no API keys) |

---

## 3. Repository layout

```
.
├── README.md                   ← This file
├── package.json                ← Root scripts: start/dev/test/fixtures/test:fixtures (delegate to web/)
├── .gitignore                  ← Ignores .env, web/.env, node_modules, …
├── .github/workflows/
│   ├── sync-docs.yml           ← Sync docs from Drive + regenerate fixtures + validate + commit
│   └── ci.yml                  ← Push/PR: install web deps + test:fixtures
├── documents/                  ← Source compliance text (committed or synced from Drive)
│   ├── canada/
│   ├── usa/
│   ├── mexico/
│   └── puerto rico/            ← Note: space in folder name
└── web/
    ├── package.json            ← Main app dependencies & scripts
    ├── server.js               ← Express app, loaders, /api/chat, /api/sections, upload
    ├── docs-parser.js          ← parseFile, parseBuffer, REGIONS
    ├── public/                 ← index.html, app.js, styles.css, static assets
    ├── scripts/
    │   ├── generate-fixtures.js   ← Build test/fixtures/*.json from documents/
    │   ├── validate-fixtures.js   ← Assert fixture shape, counts, categories (used by CI + sync)
    │   └── download-drive-docs.js ← Pull files from Google Drive into documents/
    └── test/
        ├── fixtures/           ← JSON snapshots (regenerate after doc changes)
        ├── zoocasa.compliance.spec.js
        ├── playwright.config.js
        └── test-results/       ← (gitignored patterns may apply)
```

---

## 4. How to run locally

From **repo root**:

```bash
npm install --prefix web
cp web/.env.example web/.env
# Edit web/.env — set at least OPENAI_API_KEY for chat
npm start
```

Or from **`web/`**:

```bash
cd web && npm install && cp .env.example .env && npm start
```

Default URL: **http://localhost:3000** (or next port if 3000 is in use).

**Environment variables** (`web/.env` — do not commit):

| Variable | Purpose |
|----------|---------|
| `PORT` | Server port (default `3000`) |
| `OPENAI_API_KEY` | **Required** for compliance chat |
| `OPENAI_MODEL` | Optional (default `gpt-4o-mini`) |

`GEMINI_MODEL` / `GEMINI_API_KEY` in `.env.example` are legacy/extra; match **`server.js`** before relying on Gemini.

---

## 5. How the server loads documents

On startup (and on Vercel cold start if `VERCEL` is set), the server runs, in order:

1. `loadCanadaDocuments()` → `documents/canada/`
2. `loadUsaDocuments()` → `documents/usa/`
3. `loadMexicoDocuments()` → `documents/mexico/`
4. `loadPuertoRicoDocuments()` → `documents/puerto rico/`

Each loader:

- Accepts `.txt`, `.md`, `.pdf`
- Parses into **sections** (titles + plain content + HTML for UI)
- Assigns **categories** per file order (see `CANADA_CATEGORIES`, `USA_CATEGORIES`, `MEXICO_CATEGORIES`, `PUERTO_RICO_CATEGORIES` in `server.js`)
- Fills `store[region].sections` and a truncated `fullText` (~120k chars per region for ancillary use)

**Chat** builds the prompt from **all sections** per region, with a **per-region character budget** so each jurisdiction (including Puerto Rico) is represented even when total doc size is huge. Labels in the prompt look like `[Canada]`, `[Puerto Rico]`, etc.

---

## 6. Main HTTP API (for integration testing)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/regions` | Lists region slugs |
| GET | `/api/sections?region=<slug>` | Library cards; returns `{ ok, sections: [{ id, title, contentHtml, category? }] }` |
| POST | `/api/chat` | SSE stream; body `{ message, region }` — UI uses `region: "all"` |
| POST | `/api/upload` | multipart `files` + `region`; replaces `store[region]` |

---

## 7. Google Drive sync (GitHub Actions)

Workflow: **`.github/workflows/sync-docs.yml`**

- **Triggers:** `workflow_dispatch` (manual) and `repository_dispatch` with `event_type: drive-docs-changed` (e.g. Apps Script).
- **Steps:** checkout → Node 22 → `npm install` in `web` → `node web/scripts/download-drive-docs.js` → `npm run fixtures:generate --prefix web` → **`npm run test:fixtures`** → git commit + push under `documents/` and `web/test/fixtures/`.

**Secrets (repository):**

- `GOOGLE_SERVICE_ACCOUNT_JSON` — full JSON string for a service account with Drive read access.

**Variables (repository) — folder IDs only (from Drive URL `.../folders/<ID>`):**

- `DRIVE_FOLDER_CANADA`
- `DRIVE_FOLDER_USA`
- `DRIVE_FOLDER_MEXICO`
- `DRIVE_FOLDER_PUERTO_RICO`  
  (Old name `DRIVE_FOLDER_PORTUGAL` is **not** used anymore.)

Each Drive folder must be **shared** with the service account email (Viewer is enough). The script prints a **config summary** (what is set, not secret values) to help debug CI failures.

**Workflow env:** `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` + `actions/checkout@v6`, `actions/setup-node@v6` for GitHub’s Node 20 deprecation on actions.

If **`git push` fails**, check **branch protection**: allow **GitHub Actions** or `github-actions[bot]` to push to the default branch, or use a PAT with bypass.

### Sync workflow troubleshooting

| Symptom | What to check |
|--------|----------------|
| `GOOGLE_SERVICE_ACCOUNT_JSON` / JSON parse error | Secret exists, value is the **full** service account key JSON (one line or multiline OK). |
| `No DRIVE_FOLDER_* variables are set` | Repo → **Actions → Variables**; use `DRIVE_FOLDER_PUERTO_RICO` (not `DRIVE_FOLDER_PORTUGAL`). |
| Drive `403` / `Insufficient Permission` / `File not found` | Share each folder with the **service account client email** from the JSON (`...@...iam.gserviceaccount.com`), Viewer. |
| `git push` failed | Rulesets / branch protection: allow **GitHub Actions** to push to the default branch, or use a PAT with bypass in a custom step. |
| `validate-fixtures` fails after sync | Generated JSON is malformed or section counts dropped — fix `documents/` or lower minimums in `web/scripts/validate-fixtures.js` if the shrink was intentional. |

The **Download docs** step prints a **config summary** (which variables are set, secret length only) — use that log line first when debugging.

---

## 8. Regenerating test fixtures

After changing files under `documents/`:

```bash
npm run fixtures:generate --prefix web
# or from repo root:
npm run fixtures:generate
```

This mirrors `GET /api/sections` shape into `web/test/fixtures/<region>.json` and per-file JSON under `web/test/fixtures/<region>/`.

Always run **`npm run test:fixtures`** afterward (or rely on CI) so combined fixtures stay valid.

```bash
npm run test:fixtures --prefix web
# or from repo root:
npm run test:fixtures
```

---

## 9. Fixture validation (`test:fixtures`)

[`web/scripts/validate-fixtures.js`](web/scripts/validate-fixtures.js) checks the **combined** region files produced by `fixtures:generate` (the same files the Drive sync workflow regenerates):

- `ok === true`, non-empty `sections`
- Minimum section counts per region (regression guard)
- Every section has `id`, `title`, `contentHtml`; **unique** `id`s
- `category` (when present) must match allowlists kept in sync with [`web/server.js`](web/server.js) loader categories

**CI:** [`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on **every push and pull_request** (no secrets). **Sync workflow** runs the same command after `fixtures:generate` so bad fixtures are never committed.

If you add many new docs, you may need to raise `MIN_SECTIONS` in `validate-fixtures.js`.

---

## 10. Playwright “compliance” tests

- Config: `web/playwright.config.js`
- Tests live in `web/test/*.compliance.spec.js`
- They use **`baseURL: https://www.zoocasa.com`** — they are **external regression checks**, not smoke tests for the eXplicit Express app. Running them does not start `server.js` unless you change the setup.

---

## 11. Deployment notes

- **Traditional:** Run `node web/server.js` (or `npm start` from root) behind a reverse proxy with HTTPS; inject `OPENAI_API_KEY` via the host’s secret manager.
- **Vercel:** `server.js` uses top-level `await` to preload docs when `process.env.VERCEL` is set; `export default app` is the serverless entry. Confirm Vercel **project settings** include env vars, paths to `documents/`, and long enough timeouts for cold starts + full doc load.

---

## 12. Naming / branding in the UI

Copy in `web/public/index.html` and `app.js` (e.g. welcome message) should stay aligned with **eXplicit**. The server may still log a generic line like “Compliance bot web app”; adjust in `web/server.js` if you want the log to say eXplicit.

---

## 13. Official document sources (handover)

The **eXplicit** compliance summaries under `documents/` are internal reference packs. For **official** primary sources, maintainers should store PDFs or exports in **Google Drive** (synced folders) or in `documents/{region}/`, and record provenance here.

| Jurisdiction | Primary bodies / topics | Official entry points (verify current URLs) |
|--------------|-------------------------|-----------------------------------------------|
| **Canada** | CREA, provincial regulators (RECO, BCFSA, RECA, OACIQ, etc.) | [CREA](https://www.crea.ca/), [Competition Bureau](https://www.competitionbureau.gc.ca/) — download handbooks / bulletins as your counsel approves |
| **USA** | NAR, state MLS policies, FinCEN, fair housing | [NAR policy](https://www.nar.realtor/policy), [FinCEN](https://www.fincen.gov/) |
| **Mexico** | PROFECO, NOM-247, SAT / AMPI | [PROFECO](https://www.gob.mx/profeco), [Diario Oficial (NOMs)](https://www.dof.gob.mx/) |
| **Puerto Rico** | PR licensing (JECVEBR), Stellar MLS / PRAR, PRTC | Use regulator and MLS partner portals; add PDFs your legal team clears |

**PDFs:** The app parses **`.pdf`** via `pdf-parse`. Place files in the correct `documents/` subfolder (or Drive folder) and run **`npm run fixtures:generate`** (or the sync workflow). Some official PDFs **cannot** be redistributed in a public repo — keep those in **private Drive** only and document “internal only” in the table above.

---

## 14. Quick checklist for a new maintainer

- [ ] Clone repo, `npm install --prefix web`, copy `web/.env.example` → `web/.env`, add **`OPENAI_API_KEY`**
- [ ] Confirm `documents/*` are present or run Drive sync workflow with secrets/variables configured
- [ ] Run **`npm run test:fixtures`** and **`npm start`**; verify DOCS + chat
- [ ] If using Drive sync: service account JSON secret, four `DRIVE_FOLDER_*` variables, folder sharing, branch rules for `git push`
- [ ] Update **§13** when adding official PDFs or changing source-of-truth locations
- [ ] Rotate API keys and GitHub tokens when ownership changes; remove old collaborator access

---

*Update this README when architecture or environment requirements change.*
