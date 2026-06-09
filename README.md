# Voico Calls Dashboard

A full-stack interview project built with FastAPI + SQLite on the backend and React + TypeScript on the frontend. It displays a real-time dashboard of phone calls with status tracking.

---

## Architecture

```
voico-test-interview/
  backend/    FastAPI + SQLModel + SQLite + Alembic
  frontend/   React + Vite + TypeScript + Tailwind CSS + TanStack Query
```

---

## Backend

**Stack:** Python 3.12, FastAPI, SQLModel, SQLite (aiosqlite), Alembic

### Setup

```bash
cd backend

# Install dependencies
uv sync

# Copy environment file
cp .env.example .env

# Start the development server
uv run uvicorn app.main:app --reload --port 8000
```

The database (`db.sqlite3`) is included in the repo and already contains 100 sample calls — no migrations or seeding needed to get started.

### Migrations

```bash
# Apply all pending migrations
uv run alembic upgrade head

# Create a new migration (after changing a model)
uv run alembic revision --autogenerate -m "your_message"
```

The API will be available at `http://localhost:8000`.  
Interactive docs: `http://localhost:8000/docs`

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/calls` | List calls — multi-filter, search & column sorting, paginated — ✅ extended (Task 2) |
| `GET` | `/api/calls/{id}` | Get single call |
| `PATCH` | `/api/calls/{id}/notes` | Update notes on a call — ✅ implemented (Task 1) |
| `POST` | `/api/webhook/call` | Update an existing call (status, duration, transcript, end time) + AI summary/label — ✅ implemented (Task 4) |
| `GET` | `/health` | Health check |

### Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | SQLite database path (default: `sqlite+aiosqlite:///./db.sqlite3`) |
| `OPENAI_API_KEY` | OpenAI API key — needed for Task 4 |
| `STALE_CALL_CHECK_INTERVAL_SECONDS` | How often the stale-call expiry job runs, in seconds (default: `600` = 10 min) — Task 3 |
| `STALE_CALL_THRESHOLD_SECONDS` | How long a call may stay `in_progress` before it's expired to `failed`, in seconds (default: `1800` = 30 min) — Task 3 |

---

## Frontend

**Stack:** React 18, Vite, TypeScript, Tailwind CSS, TanStack Query, axios, lucide-react, date-fns

### Setup

```bash
cd frontend

npm install
npm run dev
```

The UI will be available at `http://localhost:5173`.

### Environment Variables

| Variable | Default |
|----------|---------|
| `VITE_API_URL` | `http://localhost:8000` |

---

## Development Notes

- All Python code is fully async (FastAPI + SQLModel async)
- Database interactions use `session.flush()` — commits are handled by the `@session_manager` decorator at the router level
- CORS is open for all origins (demo project)
- No authentication

---

## Interview Tasks

There are four features to implement. Some tasks require adding new endpoints and fields from scratch; others have the structure already in place and just need the logic filled in.

---

### Task 1 — Call Notes

**What exists:** The `Call` model has no notes field. There is no way for a user to annotate a call.

**What to build:** Add a `notes` field to the `Call` model — a nullable free-text field. Create an Alembic migration for it. Add a `PATCH /api/calls/{id}/notes` endpoint that accepts a JSON body `{"notes": "..."}` and persists it. On the frontend, make the notes field editable inline inside the call detail drawer: clicking on it should turn it into a textarea, and saving should call the new endpoint and update the UI immediately.

#### ✅ Solution

**Backend**

- **Model** ([`app/modules/calls/schema.py`](backend/app/modules/calls/schema.py)) — added a nullable `notes: Optional[str] = Field(default=None)` column to the `Call` model and exposed `notes` on the `CallResponse` schema.
- **Request schema** ([`schema.py`](backend/app/modules/calls/schema.py)) — `NotesUpdatePayload` declares `notes: Optional[str]` as **required but nullable**. The key must be present (an empty body `{}` is rejected with `422` instead of silently wiping notes), while `{"notes": null}` is the explicit way to clear it.
- **Migration** ([`0002_add_notes_to_calls.py`](backend/app/database/alembic/versions/0002_add_notes_to_calls.py)) — hand-written Alembic revision (down-revision `0001`) that `op.add_column`s the nullable `notes` column, with a matching `downgrade()` that drops it. Applied to the bundled `db.sqlite3` with `uv run alembic upgrade head`, so the shipped database is already at revision `0002` and the app runs without any extra steps.
- **Service** ([`service.py`](backend/app/modules/calls/service.py)) — new `update_notes(call_id, notes)` that loads the call (`404` if missing), persists via the existing `CallRepository.update`, and bumps `updated_at`. It normalises blank/whitespace-only input to `None` (`(notes or "").strip() or None`) so that `null` is the single canonical representation of "no notes" regardless of the client.
- **Router** ([`router.py`](backend/app/modules/calls/router.py)) — new `PATCH /api/calls/{call_id}/notes` endpoint, decorated with `@session_manager` so the write is committed (or rolled back on error), consistent with the existing project convention.

**Frontend**

- **Types & API** ([`types/calls.ts`](frontend/src/types/calls.ts), [`services/api.ts`](frontend/src/services/api.ts)) — added `notes` to the `Call` type and a `callsApi.updateNotes(id, notes)` helper that calls the new `PATCH` endpoint.
- **Inline editing** ([`CallDetailDrawer.tsx`](frontend/src/modules/calls/CallDetailDrawer.tsx)) — a new `NotesSection` renders the notes as clickable text (with a "Click to add notes…" placeholder when empty). Clicking it (or the **Edit** button) swaps in an auto-focused `<textarea>`. Saving uses a TanStack Query `useMutation`; on success it (1) updates the open drawer via an `onUpdated` callback so the change shows **immediately**, and (2) invalidates the `["calls"]` query so the table stays in sync. Niceties: **Save** is disabled when there are no changes (no pointless requests), a blank textarea clears the notes to `null`, **⌘/Ctrl+Enter** saves and **Esc** cancels, edit state resets when a different call is opened, and the UI shows a spinner while saving and an inline error on failure.
- **Wiring** ([`CallsPage.tsx`](frontend/src/modules/calls/CallsPage.tsx)) — passes `onUpdated={setSelectedCall}` so the selected-call state reflects the saved notes.

**Verification**

- Exercised the endpoint over the real ASGI app across every case: set text, `null` (clear), empty string → `null`, whitespace → `null`, `"  hi  "` → `"hi"` (trimmed), multi-line preserved, empty body `{}` → `422`, wrong type → `422`, unknown id → `404` — all as expected.
- Confirmed the migration is reversible by running a `downgrade`/`upgrade` roundtrip on a copy of the DB (column dropped then re-added, all 100 rows preserved).
- Frontend typechecks clean (`tsc -b`).

---

### Task 2 — Advanced Filtering & Search

**What exists:** The table has tabs to filter by status. That's it.

**What to build:** A proper multi-filter system so users can narrow down calls using several conditions simultaneously.

On the **backend**, extend `GET /api/calls` to accept additional query parameters: partial match on caller name and phone number, exact match on label, min/max duration in seconds, and column sorting. All filters should be optional and combinable — multiple active filters are ANDed together.

On the **frontend**, add a filter UI that lets users add and remove filters. Each active filter should be visible as a removable chip or tag. Column headers should be clickable to sort ascending/descending (one active sort at a time). All active filters and sort state should be reflected in the API request in real time.

#### ✅ Solution

**Backend**

- **Filter/sort schemas** ([`schema.py`](backend/app/modules/calls/schema.py)) — added two enums, `CallSortField` (the whitelist of sortable columns) and `SortOrder` (`asc`/`desc`), plus a `CallFilters` model that bundles every optional filter + the sort into one object. Constraining sorting to an enum keeps the repository's `getattr(Call, …)` safe — only known columns can ever be ordered on.
- **Endpoint** ([`router.py`](backend/app/modules/calls/router.py)) — `GET /api/calls` now declares each new parameter as an explicit, documented `Query(...)`: `caller_name` & `phone_number` (partial), `label` (exact, enum-validated), `min_duration` / `max_duration` (`ge=0`), `sort_by` (enum), `sort_order` (enum). Declaring them individually (rather than as an opaque model) gives clean Swagger docs and free validation — invalid enums or negative durations are rejected with **422** before any DB work. The handler assembles a `CallFilters` and passes it to the service. Defaults (`sort_by=created_at`, `sort_order=desc`, no filters) reproduce the **original behaviour**, so the change is backward-compatible.
- **Service** ([`service.py`](backend/app/modules/calls/service.py)) — validates the one cross-field rule that `Query` can't (`min_duration ≤ max_duration`, else **422**) before delegating.
- **Repository** ([`repository.py`](backend/app/modules/calls/repository.py)) — a single `_apply_filters` helper **ANDs** together whichever filters are set, reused across the page query, the total-count query, and the per-status counts:
  - Partial matches use case-insensitive `ILIKE` with **LIKE-wildcard escaping** (`_escape_like`), so a literal `%` or `_` in the search box is matched literally instead of acting as a wildcard.
  - Sorting maps the enum to its column with `asc()`/`desc()`, plus a secondary `Call.id` tiebreaker so pagination stays **deterministic** when the sort column has ties.
  - The per-status **counts** were collapsed into one `GROUP BY` query and now honour every active filter **except** status — so the status tabs/stat-cards reflect the current search, and selecting "Success" doesn't zero out the other tabs.

**Frontend**

- **Types & API** ([`types/calls.ts`](frontend/src/types/calls.ts), [`services/api.ts`](frontend/src/services/api.ts)) — added `CallSortField`, `SortOrder`, `SortState`, `CallFilterValues`, a `CALL_LABELS` constant (mirrors the backend enum), and the new params on `CallsQueryParams`. `api.ts` needed **no change** — it already forwards the whole params object and axios drops `undefined`, so only *active* filters hit the wire.
- **Filter bar** ([`CallsFilterBar.tsx`](frontend/src/modules/calls/CallsFilterBar.tsx), new) — an **Add filter** dropdown that only lists fields not already active; each active filter renders as a **removable chip** (× to remove, click to re-edit); a **Clear all** resets everything. Editing happens in an inline editor that updates the chip live, with numeric inputs constrained to digits and the label field rendered as a `<select>`. A document click-away closes the menu/editor and `Enter`/`Esc` close it. Fields render off a stable order/key so the editor never remounts (and loses focus) when a freshly-typed value flips a field from inactive→active. Inputs/selects carry `aria-label`s.
- **Sortable headers** ([`CallsTable.tsx`](frontend/src/modules/calls/CallsTable.tsx)) — column headers are now buttons that **cycle asc → desc → off** (one active sort at a time), showing up/down/neutral chevrons; the `<th>` exposes `aria-sort`.
- **Wiring** ([`CallsPage.tsx`](frontend/src/modules/calls/CallsPage.tsx)) — holds `filters` and `sort` state; both are part of the TanStack Query **key**, so any change reflects in the request **in real time**. Changing a filter, sort, or tab resets to page 1; the existing status tabs continue to drive the `status` filter (so status isn't duplicated in the filter bar). Three touches keep it production-grade:
  - **Debounced search** ([`useDebouncedValue.ts`](frontend/src/hooks/useDebouncedValue.ts)) — the filter values feed the query through a 250 ms debounce, so typing fires *one* request after a pause instead of one per keystroke, while the chips/inputs stay instant.
  - **No spinner flash** — `placeholderData: keepPreviousData` keeps the current rows on screen (with the header's "Syncing…" indicator) while the next page/filter loads, instead of blanking the table on every change.
  - **Friendly range validation** — when `min_duration > max_duration` the query is skipped (`enabled`) and an inline hint is shown, so an impossible range never surfaces the generic "failed to load" error (the backend still enforces the same rule with a 422).

**Verification**

- Exercised the endpoint both directly (service/repository against the bundled `db.sqlite3`) and over **HTTP** (in-process ASGI): partial caller/phone matches (case-insensitive — `ava` == `AVA`), exact label, duration ranges, asc/desc sorting on **every** sortable column, combined **ANDed** filters, stable non-overlapping pagination under a tied sort, well-formed empty results, counts that stay independent of the status tab, and LIKE-wildcard escaping (a literal `%` matches 0 rows, not all 100).
- Confirmed every validation path returns **422**: unknown `label`, negative `min_duration`, unknown `sort_by`, and `min_duration > max_duration` (with a clear message).
- Backend `ruff check` / `ruff format` clean and `mypy` clean on the changed files; frontend `tsc -b` and `vite build` both pass.

---

### Task 3 — Stale Call Auto-Expiry

**What exists:** The database contains calls with status `in_progress`. They are meant to get updated to `success` or `failed` via the webhook. There is no mechanism to handle calls that never receive a closing webhook.

**What to build:** A background job that runs automatically while the server is up. Every 10 minutes it checks for calls that have been `in_progress` for more than 30 minutes and marks them as `failed` in a single batch update. It should log how many calls were expired each run.

The interval (10 min) and the stale threshold (30 min) must be configurable via environment variables — add them to `.env` and `app/core/config.py` so they are easy to adjust for testing without touching the code.

#### ✅ Solution

- **Config** ([`config.py`](backend/app/core/config.py), [`.env`](backend/.env), [`.env.example`](backend/.env.example)) — two new settings, `STALE_CALL_CHECK_INTERVAL_SECONDS` (default `600` = 10 min) and `STALE_CALL_THRESHOLD_SECONDS` (default `1800` = 30 min). Both are expressed **in seconds** on purpose: for testing you can dial them right down (e.g. interval `5`, threshold `10`) and watch a call expire end-to-end in seconds — no code change, no waiting half an hour. Defaults reproduce the spec's 10-/30-minute behaviour. Both are validated `ge=1`, so a nonsensical `0` (which would busy-loop the DB or expire brand-new calls) **fails fast at startup** instead of silently misbehaving.
- **Background job wiring** ([`main.py`](backend/app/main.py)) — a FastAPI `lifespan` handler spawns the expiry loop as an `asyncio` task on startup and, on shutdown, **cancels it and awaits the cancellation**, so the job lives exactly as long as the server and stops cleanly (no orphaned task, no errors on Ctrl-C). This replaces the previous app with no lifecycle hooks.
- **The loop** ([`tasks.py`](backend/app/modules/calls/tasks.py)) — `stale_call_expiry_loop()` runs **one pass immediately** on startup (so already-stale calls are cleaned up right away rather than after the first full interval), then repeats every `STALE_CALL_CHECK_INTERVAL_SECONDS`. A failed pass is logged (`logger.exception`) and **swallowed** so a transient DB hiccup never kills the loop — the next interval simply retries. It logs a line when it starts and when it's cancelled. Config is read **once here, at the edge**, and the threshold is passed down — the service stays config-agnostic.
- **Per-run transaction** ([`tasks.py`](backend/app/modules/calls/tasks.py)) — each pass (`expire_stale_calls_once`) opens its **own session** and commits on success / rolls back on error, mirroring the `@session_manager` "commit at the edge" convention the routers use (the background job has no request/decorator to do this for it).
- **Service** ([`service.py`](backend/app/modules/calls/service.py)) — `expire_stale_calls(threshold_seconds)` computes the cutoff as `utcnow() − threshold`, measured against each call's **`started_at`** (when the call actually began), delegates the write to the repository, and **logs the count every run — including `0`** — so the job's activity is always visible in the server logs, exactly as the task asks. The threshold is **injected** rather than read from global config, keeping the service a pure function of its inputs (consistent with the rest of the app, where only `db.py`/`main.py` touch `settings`). `started_at` and `utcnow()` are both naive UTC, so the comparison is apples-to-apples; the strict `<` correctly means "*more than* the threshold", so a call that started exactly at the threshold is left alone.
- **Repository** ([`repository.py`](backend/app/modules/calls/repository.py)) — `expire_stale_calls()` is the **single batch update**: one set-based `UPDATE calls SET status='failed', updated_at=now WHERE status='in_progress' AND started_at < cutoff`. No per-row loads, one round trip; it returns `rowcount` (the number expired). `synchronize_session=False` skips reconciling the short-lived background session's (empty) identity map. This keeps the same `router → service → repository` layering as the rest of the app (here the loop stands in for the router).

**Verification**

- A scripted, multi-case run against a **copy** of the bundled `db.sqlite3` (the 18 `in_progress` calls in it all started weeks ago, so every one is stale): a huge threshold expires **0** (nothing is touched); the default 30-min threshold expires exactly **18** in one batch, growing `failed` 24 → 42 while `success` stays untouched; a freshly-inserted `in_progress` call (started "now") is correctly **spared**; a call started *exactly* at the cutoff is **not** expired (boundary of "more than"); every expired row has `status='failed'` and a freshly-bumped `updated_at`; and a second pass expires **0** (idempotent).
- Ran the **real** `stale_call_expiry_loop()` via `asyncio.create_task`, let its immediate pass run, then cancelled and awaited it — the exact path the `lifespan` handler uses — confirming the loop expires the stale calls and shuts down cleanly. Also drove the app through a FastAPI **`TestClient`** context so the real ASGI **lifespan startup + shutdown** fire end-to-end without error. (In fact, while developing, the running `uvicorn --reload` server hot-reloaded and expired the live DB's 18 stale calls on its own — the feature working in situ.)
- Confirmed the **fail-fast** config: `STALE_CALL_CHECK_INTERVAL_SECONDS=0` raises a `ValidationError` at startup rather than booting into a busy loop.
- Backend `ruff check` / `ruff format` clean; `mypy` clean on all changed files.

---

### Task 4 — Webhook AI Integration

**What exists:** The `POST /api/webhook/call` endpoint exists with a `pass` body. The `CallLabel` enum is defined in `schema.py`. The webhook payload accepts `call_id`, `status`, `duration_seconds`, `raw_transcript`, and `ended_at`.

**What to build:** Implement the `POST /api/webhook/call` endpoint. It has two responsibilities:

1. **Update the call** — find the call by `call_id`, update its `status`, `duration_seconds`, `raw_transcript`, and `ended_at`, then persist the changes.
2. **AI enrichment** — if the new status is `success` or `failed` and a `raw_transcript` is provided, call the OpenAI API (`gpt-4o-mini`) to generate a short summary (2–3 sentences) and classify the call into one of the `CallLabel` values. Store both on the call record. If the OpenAI call fails, log the error and continue — `summary` and `label` should remain `null`.

**How to test:** Once implemented, use the interactive API docs at `http://localhost:8000/docs` (powered by Swagger UI). Steps:
1. Call `GET /api/calls?status=in_progress` and copy an `id` from the response.
2. Open `POST /api/webhook/call`, click **Try it out**, and paste a payload like:
   ```json
   {
     "call_id": "<paste id here>",
     "status": "success",
     "duration_seconds": 120,
     "ended_at": "2024-01-01T12:00:00",
     "raw_transcript": "Agent: How can I help?\nCaller: I need to upgrade my plan."
   }
   ```
3. Hit **Execute** — the response will show the updated call with the generated summary and label.

#### ✅ Solution

The endpoint is implemented in the project's existing `router → service → repository` layering, with the OpenAI call isolated behind a small, best-effort enrichment client so the AI integration can never break the core "update the call" path.

- **Router** ([`router.py`](backend/app/modules/calls/router.py)) — `POST /api/webhook/call` now resolves a `CallService` via the existing `get_call_service` dependency and delegates to `service.process_webhook(payload)`. It keeps the `session: SessionDep` parameter and the `@session_manager` decorator, so the whole webhook (call update **and** any enrichment) is committed in **one transaction** — or rolled back together on error — consistent with the rest of the app. Because FastAPI caches dependencies per-request, the `session` the decorator commits is the very same one the service writes through.
- **Service** ([`service.py`](backend/app/modules/calls/service.py)) — new `process_webhook(payload)` with two clearly separated responsibilities:
  1. **Update the call** — loads it by `call_id` (**404** `Call not found` if unknown), then applies the payload. `status` is required and always set; `duration_seconds`, `raw_transcript` and `ended_at` are written **only when the payload actually provides them**, so a webhook that omits a field never silently wipes a value already on the record. `updated_at` is bumped.
  2. **AI enrichment** — runs **only** when the new status is `success` or `failed` **and** the payload carried a `raw_transcript`. It asks the enricher for a summary + label and, if one comes back, stores both. If enrichment returns `None` (any failure, or no API key), `summary`/`label` are simply left untouched (stay `null`) — exactly as the task requires.
  - The service gained an injectable `enricher` (defaulting to a real `CallEnricher`); constructing it is cheap (no network until used), which keeps every other route unaffected while letting tests pass a fake.
- **Enrichment client** ([`enrichment.py`](backend/app/modules/calls/enrichment.py), new) — a thin async wrapper over OpenAI's Chat Completions API, pinned to **`gpt-4o-mini`** as specified:
  - Uses **Structured Outputs** (`response_format` `json_schema` with `strict: true`) whose schema fixes `summary` as a string and constrains `label` to an `enum` built **directly from `CallLabel`** — so the model can only ever return a valid label, and adding a new `CallLabel` automatically extends the allowed set. The schema is built once at import time and typed as the SDK's own `ResponseFormatJSONSchema`, so it's statically checked rather than an opaque dict. The system prompt asks for a concise **2–3 sentence** summary.
  - It is **best-effort by construction**: `enrich()` **never raises**, always returning `None` on any problem. Failures are logged at two levels: **expected** API failures (bad/expired key, no quota, rate-limit, timeout, connection, 5xx — all `openai.APIError` subclasses) get a **concise one-line `WARNING`** (no traceback spam on every completed call), while genuinely **unexpected** errors (malformed JSON, an unknown label, a bug) keep a full `logger.exception` traceback. It also short-circuits to `None` (with a `WARNING`) when `OPENAI_API_KEY` is unset and on a blank transcript, so it never makes a doomed network call.
  - **Bounded latency** — enrichment runs *inside* the webhook request, so the client is created with an explicit **20s timeout** and **a single retry** (instead of the SDK's 600s / 2-retry defaults). A flaky API can no longer keep the request — and its DB transaction — open for minutes; a persistent error (e.g. an account with no quota) falls back quickly. The `AsyncOpenAI` client is used as an async context manager so its HTTP connections are always closed, and a structured-output **refusal** or a **blank summary** is treated as "no enrichment" (logged, `None`) rather than stored.
- **Config / env** — no new variables were needed: `OPENAI_API_KEY` already exists in [`config.py`](backend/app/core/config.py) and [`.env.example`](backend/.env.example). Set a real, **funded** key in `.env` to see live summaries/labels; leave it blank (or unfunded) and the webhook still updates the call (summary/label stay `null`).

**Verification**

- Drove the **real ASGI app** over HTTP (in-process `httpx` + `ASGITransport`) against a throwaway **copy** of the bundled `db.sqlite3` (which now has `0` `in_progress` calls — Task 3's job already expired them — so the test seeds its own fresh ones). With the OpenAI call **stubbed** (no key, no network, no cost), **24/24** checks passed across every path:
  - **`success` + transcript** → status/`duration_seconds`/`ended_at`/`raw_transcript` all updated, `summary` + `label` set from the enricher, the enricher received the transcript, and the change **persists** on a follow-up `GET`.
  - **`in_progress` + transcript** → enricher **not** called, `summary` stays `null` (enrichment is only for completed calls).
  - **`failed` + transcript but enrichment returns `None`** → call still updates to `failed`, `summary`/`label` remain `null` (the required graceful fallback).
  - **`success` with no transcript** → enricher **not** called, no crash.
  - **Unknown `call_id`** → **404**.
  - **Status-only update** → existing `duration_seconds` and `raw_transcript` are **preserved**, not wiped.
  - **Real `CallEnricher`** → returns `None` (no network) when the API key is empty and on a blank transcript.
- **Live OpenAI run (confirmed working end-to-end)** — exercised the **real** `gpt-4o-mini` call with a funded key. A free `models.list()` diagnostic confirmed the key is valid and `gpt-4o-mini` is accessible; then four representative transcripts each came back with a correct classification and a clean 2–3 sentence summary — *"upgrade my plan"* → **Sales inquiry**, *"…I want a refund"* → **Complaint**, *"book a dental check-up"* → **Appointment**, *"password reset email never arrived"* → **Support**. Finally a full webhook round-trip through the ASGI app (`POST /api/webhook/call`, real enricher, DB copy) returned **200** with `status=success`, a live-generated `summary`, and `label="Sales inquiry"`, and the values **persisted** on a follow-up `GET`. **12/12** live checks passed.
  - During earlier testing two keys returned **`429 insufficient_quota`** (valid key, but the account had no prepaid balance); the client correctly caught it, logged a concise warning, and left `summary`/`label` `null` while still updating the call — so if live summaries ever stop appearing, check that `OPENAI_API_KEY` points at an account with **billing/credits** enabled (platform.openai.com → Billing).
- Backend `ruff check` / `ruff format` clean and `mypy` clean on all changed files. The shipped `db.sqlite3` was left untouched (all testing ran on a copy, which was deleted afterwards).
