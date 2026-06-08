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
| `GET` | `/api/calls` | List calls (filterable by status, paginated) |
| `GET` | `/api/calls/{id}` | Get single call |
| `PATCH` | `/api/calls/{id}/notes` | Update notes on a call — ✅ implemented (Task 1) |
| `POST` | `/api/webhook/call` | Update an existing call (status, duration, transcript, end time) — to be implemented in Task 4 |
| `GET` | `/health` | Health check |

### Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | SQLite database path (default: `sqlite+aiosqlite:///./db.sqlite3`) |
| `OPENAI_API_KEY` | OpenAI API key — needed for Task 4 |

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

---

### Task 3 — Stale Call Auto-Expiry

**What exists:** The database contains calls with status `in_progress`. They are meant to get updated to `success` or `failed` via the webhook. There is no mechanism to handle calls that never receive a closing webhook.

**What to build:** A background job that runs automatically while the server is up. Every 10 minutes it checks for calls that have been `in_progress` for more than 30 minutes and marks them as `failed` in a single batch update. It should log how many calls were expired each run.

The interval (10 min) and the stale threshold (30 min) must be configurable via environment variables — add them to `.env` and `app/core/config.py` so they are easy to adjust for testing without touching the code.

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
