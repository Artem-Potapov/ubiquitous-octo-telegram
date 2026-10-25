# Frontend ↔ Backend Integration

The frontend runs on a simulated backend until the FastAPI service is ready. This document is for the backend team: what the UI calls, which `DBManager` method each call maps to, and the few things the UI needs that `db_contract.py` doesn't cover yet.

## Running the frontend

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

By default the app uses `src/api/mockBackend.js`, an in-memory implementation that follows the `DBManager` rules: membership checks, redaction with the `REDACTED_*` constants, and patient-only grants. Refreshing the page resets the demo data.

To use the real API, create `frontend/.env.local`:

```
VITE_USE_MOCK_API=false
VITE_API_BASE_URL=http://localhost:8000
```

FastAPI needs CORS enabled for `http://localhost:5173`.

## How the UI talks to the API

- All requests go through `src/api/httpBackend.js`. Components never call `fetch` directly.
- JSON bodies use the **exact pydantic models** from `db_contract.py`, with snake_case fields. Dates are `YYYY-MM-DD`, datetimes ISO 8601, and times `HH:MM` or `HH:MM:SS`.
- **Viewer identity (demo only):** the demo role switcher sends the viewer's person id in an `X-Viewer-Id` header. Pass it through as `viewer_id`. Production would take it from an authenticated session.
- **Errors:** `NotFoundError` → 404, `AccessDeniedError` → 403, `ConflictError` → 409, with `{"detail": "..."}`. The UI shows `detail` in a toast.
- **Redaction must happen server-side.** The UI renders whatever it receives, and it treats `is_redacted: true` rows as locked placeholders.

## Proposed endpoints

None of these exist yet. The paths are a proposal; if you choose different ones, only `httpBackend.js` needs updating.

| Method & path | DBManager method |
|---|---|
| `GET /people/{id}` | `get_person` |
| `GET /people/{id}/networks` | `list_networks_for_person` |
| `GET /networks/{id}` | `get_care_network` |
| `GET /networks/{id}/people` | `list_people_in_network` |
| `GET /networks/{id}/graph` | `get_network_graph` |
| `GET /networks/{id}/tasks` | `list_tasks` |
| `PATCH /tasks/{id}` (body: `TaskUpdate`) | `update_task` |
| `PUT /tasks/{id}/assignments/{person_id}` | `assign_task` |
| `DELETE /tasks/{id}/assignments/{person_id}` | `unassign_task` |
| `PATCH /tasks/{id}/assignments/{person_id}` (body: `{"status": ...}`) | `set_assignment_status` |
| `GET /networks/{id}/availability` | `list_availability_in_network` |
| `GET /networks/{id}/care-plans` | `list_care_plans` |
| `GET /networks/{id}/gaps?status=open\|resolved` (omit = all) | `list_gaps` |
| `POST /gaps/{id}/resolve` (body: `{"resolved_by_person_id": n}`) | `resolve_gap` |
| `POST /checkins` (body: `CheckinCreate`) | `create_checkin` |
| `GET /networks/{id}/people/{pid}/checkins?limit=` | `list_checkins` |
| `GET /networks/{id}/burnout/latest` | `list_latest_burnout_scores` |
| `GET /networks/{id}/people/{pid}/burnout?limit=` | `get_burnout_history` |
| `PUT /networks/{id}/grants/{grantee_id}` (granter = viewer) | `grant_restricted_access` |
| `DELETE /networks/{id}/grants/{grantee_id}` (revoker = viewer) | `revoke_restricted_access` |
| `GET /networks/{id}/grants` | `list_access_grants` |
| `GET /networks/{id}/can-view-restricted` | `can_view_restricted` |

### Endpoints with no DBManager method yet

| Method & path | Why the UI needs it |
|---|---|
| `POST /networks/{id}/gaps/detect` | After every write, the UI asks for gap detection and burnout scoring to re-run. It then reloads. If the backend re-runs detection automatically on writes, this can be a no-op. |
| `GET /networks/{id}/patient-profile` | Overview header: age, location, discharge date, one-line summary. Nothing in the contract holds these. |
| `POST /demo/reset` | Reset button in the role switcher, so a demo can be replayed (`reset_all_data` + re-seed). |

## Write order when resolving a gap

`replace_open_gaps` deletes open gaps and changes their ids, so the UI resolves a gap **before** changing the underlying task:

1. `POST /gaps/{id}/resolve`
2. Fix the task: assign, unassign, set a status, or update it
3. `POST /networks/{id}/gaps/detect`
4. Reload

## Frontend notes (TypeScript rewrite)

The rewrite is a single-screen dashboard (`src/App.tsx`) and calls the same endpoints as above; nothing new is required of the backend.

- **Mock-only features.** Care-plan upload and conflict review (`createCarePlan`, `analyzeCarePlans` in `mockBackend.js`) have no endpoints, so the Care Plans tab hides them when `VITE_USE_MOCK_API=false`. The activity log shows "Reassigned to ..." but not an SMS result, because no endpoint returns one.
- **Derived on the client for now.** `components/graph/gapEdges.ts` works out which two people a gap touches from task owners and care-plan authors, and `lib/burnout.ts` splits the score into its parts using the formula below. A `node_ids` field on `Gap` and a breakdown on the burnout score would let the backend own both.
- **Viewer id.** Role buttons map to seeded people in `src/store/roles.ts` (1, 2, 6 and 9) and send that id as `X-Viewer-Id`.

## Gap-detection rules the UI expects

These are the rules in `src/domain/gapEngine.js`. The mock uses them, so the backend engine can port them directly.

| `gap_kind` | Rule | Severity | `suggested_assignee_id` |
|---|---|---|---|
| `unowned` | Task has zero assignments | `high` if due ≤ 2 days or overdue, `medium` ≤ 7 days, otherwise `low` | Top-ranked eligible person |
| `redundant` | `is_exclusive` and 2+ assignments. Non-exclusive tasks with several owners are intentional backups and are **not** flagged. | `medium` | The owner with the lightest load, as the one to keep |
| `missed` | One gap per assignment with `status = missed` | `high` | Top-ranked alternative owner |
| `plan_conflict` | Optional AI care-plan review (Gemini). The demo uses a canned result; core detection never depends on it. | From the AI | Usually a physician |

**Suggestion ranking** (`src/domain/suggestions.js`):
- People who don't match `required_role` (subrole or person_type) are excluded. This keeps clinical tasks away from family members.
- The patient is excluded.
- Everyone else is scored on availability on the due date's weekday (40), lightness of current load (40), exact subrole match (+20), and −10 per missed assignment.

**Burnout score** (`src/domain/workload.js`), an illustrative formula only:
- `score = 65 × task_share + min(10 × missed, 15) + 20 × max(0, −sentiment_average)`
- `task_share` is the person's share of the family's weekly task occurrences, weighted daily 7, weekly 1, monthly 0.25, once 1, as needed 0.5. Shared tasks are split between owners.

## Gaps between the contract and the UI

These are worked around on the frontend for now. Each would be a contract change, so it's your call.

1. **No workload-imbalance gap kind.** The UI computes it client-side and flags anyone with ≥ 50% of family load. A `GapKind.overload` would let the backend own it.
2. **No task priority.** The UI derives urgency from the due date and status.
3. **No backup or secondary owner.** The UI treats non-exclusive tasks as shared. An `is_backup` flag on `TaskAssignment` would express "primary plus backup" on exclusive tasks.
4. **No acceptance step.** "Ask Daniel → Daniel accepts" is simulated with a short delay. A real flow would need an assignment state such as `requested`, or a notifications table.
5. **One restricted tier.** The contract has one grant per person covering all restricted items. The privacy page shows coordination categories as always visible plus one toggle for restricted health info. Per-category grants (diagnoses vs. medications vs. notes) would need an `AccessGrant.category` field.
6. **Patient profile fields** (age, location, discharge date) have no model.
