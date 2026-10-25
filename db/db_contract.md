# DBManager Contract — Caregiver Constellation

Oct 24, 2026 · @Artem

## Purpose & ground rules

`DBManager` is the only code that touches SQLite. Everyone codes against the abstract class in `db_contract.py`; the real `SQLiteDBManager` and any teammate's `FakeDBManager` are interchangeable as long as both follow this doc.

- `db_contract.py` holds the shared Pydantic models, enums, exceptions and the abstract `DBManager`. Import from it; never redefine a model locally.
- Every method is `async`, returns Pydantic models (never raw rows or dicts), and takes `*Create` / `*Update` models as input.
- Every method is one transaction: it either fully succeeds or changes nothing.
- `DBManager` enforces read visibility (access control) and data integrity. It does not enforce business rules such as "exclusive tasks may only have one owner" — the gap engine detects those.
- `DBManager` never calls Gemini. Sentiment scores, gap rows and burnout scores are computed by their engines and passed in.
- Engines and seed scripts read with `SYSTEM_VIEWER_ID` (0), which sees everything. Request handlers always pass the logged-in person's id.

Wiring in FastAPI (one instance per process, shared through `app.state`):

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from db_contract import DBManager

@asynccontextmanager
async def lifespan(app: FastAPI):
    database = SQLiteDBManager("constellation.db")   # or FakeDBManager()
    await database.connect()
    await database.init_schema()
    app.state.database = database
    yield
    await database.close()

app = FastAPI(lifespan=lifespan)

def get_database(request: Request) -> DBManager:
    return request.app.state.database
```

Swapping the fake for the real class is a one-line change in `lifespan`; nothing else in the API should know which one is running.

## Schema

Twelve tables: your eleven plus `network_members` and `access_grants`. Every table has an integer `id` primary key (autoincrement, starting at 1) unless noted, and `PRAGMA foreign_keys = ON` is set on connect.

| Table | Columns | Notes |
| --- | --- | --- |
| `people` | `id`, `person_type` (patient \| professional \| family), `subrole` (text, e.g. "cardiologist", "spouse"), `full_name`, `phone_number`, `is_physician` (bool, default false), `created_at` | One table for every node. `is_physician` drives access control. |
| `care_networks` | `id`, `patient_id` → people (unique), `network_name`, `created_at` | One network per patient. |
| `network_members` | `network_id` → care\_networks, `person_id` → people, `joined_at`; PK (`network_id`, `person_id`) | The patient is added automatically when the network is created. |
| `relationships` | `id`, `network_id`, `source_person_id`, `target_person_id`, `label`, `sensitivity`, `created_at` | Graph edges. Both ends must be members. |
| `tasks` | `id`, `network_id`, `title`, `category`, `required_role` (text, nullable), `frequency`, `due_date` (nullable), `is_exclusive` (bool), `sensitivity`, `created_by_person_id` (nullable), `created_at` | `category`: medication \| appointment \| monitoring \| transport \| household \| communication \| other. `frequency`: once \| daily \| weekly \| monthly \| as\_needed. |
| `task_assignments` | `id`, `task_id`, `person_id`, `status` (pending \| done \| missed), `assigned_at`, `updated_at`; unique (`task_id`, `person_id`) | Ownership. For recurring tasks, `status` is the current cycle. |
| `availability` | `id`, `person_id`, `weekday` (0 = Monday … 6 = Sunday), `start_time`, `end_time` | Weekly windows; feeds suggested assignees. |
| `care_plans` | `id`, `network_id`, `author_person_id`, `title`, `raw_text`, `sensitivity`, `created_at` | Raw specialist text for the Gemini collision check. |
| `gaps` | `id`, `network_id`, `gap_kind` (unowned \| redundant \| plan\_conflict \| missed), `severity` (low \| medium \| high), `description`, `task_id` (nullable), `suggested_assignee_id` (nullable), `related_care_plan_ids` (JSON list of ints), `status` (open \| resolved), `created_at`, `resolved_at` (nullable), `resolved_by_person_id` (nullable) | Engine output, saved so the frontend and the cached demo read rows. |
| `checkins` | `id`, `person_id`, `network_id`, `message`, `sentiment_score` (-1.0 to 1.0), `created_at` | Sentiment is computed before insert. |
| `burnout_scores` | `id`, `person_id`, `network_id`, `score` (0–100 int), `task_share` (0.0–1.0), `missed_count`, `sentiment_average` (nullable), `computed_at` | Append-only, so the UI can draw trends. |
| `access_grants` | `network_id`, `grantee_person_id`, `granted_by_person_id`, `granted_at`; PK (`network_id`, `grantee_person_id`) | Who the patient shares restricted items with. |

`sensitivity` is `normal` or `restricted` and exists on `tasks`, `relationships` and `care_plans` — the three places sensitive medical facts can appear. Timestamps are stored as ISO 8601 UTC text, dates as `YYYY-MM-DD`, times as `HH:MM`.

## Access control

Restricted items are visible in full only to the patient, physicians in the network, and people the patient has granted access; everyone else gets a redacted copy. Every read of network data takes a `viewer_id`, and `DBManager` applies these rules itself so no endpoint can forget them.

1. **Membership.** A viewer who is not a member of the network gets `AccessDeniedError` on any read of that network. `SYSTEM_VIEWER_ID` (0) bypasses every check.
2. **Restricted visibility.** A member sees restricted items in full when any of these is true: they are the network's patient; `is_physician` is true; they have a row in `access_grants` for that network.
3. **Redaction.** Other members get restricted items with `is_redacted = True` and the text replaced, never omitted. This keeps the graph and gap counts identical for everyone while hiding what the item is.
4. **Grants.** Only the patient (or `SYSTEM_VIEWER_ID`) can grant or revoke. Physicians have access implicitly and cannot be revoked. Granting twice is a no-op.
5. **Check-ins** are readable only by their author and `SYSTEM_VIEWER_ID`. **Burnout scores** are readable by every member.
6. **Writes are not checked** except grant and revoke. Who may create or edit what is the API layer's job.

What a redacted copy looks like:

| Model | Replaced fields | Kept fields |
| --- | --- | --- |
| `Task` | `title` → "Restricted task", `category` → `other`, `required_role` → `None` | id, frequency, due date, `is_exclusive`, sensitivity, assignments |
| `Relationship` | `label` → "Restricted" | id, both endpoints, sensitivity |
| `CarePlan` | `title` → "Restricted care plan", `raw_text` → "" | id, author, timestamps |
| `Gap` (linked to a restricted task or care plan) | `description` → "Gap on a restricted item" | kind, severity, `task_id`, suggested assignee, status |

Redaction happens on the returned copy only; stored rows are never changed.

## Method reference

43 async methods in eleven groups. Every method that reads network data takes `viewer_id` and applies the access rules above; exact signatures and docstrings are in `db_contract.py`.

### Lifecycle

| Method | Returns | Behaviour & errors |
| --- | --- | --- |
| `connect()` | `None` | Opens the connection, sets `foreign_keys` on. |
| `close()` | `None` | Safe to call twice. |
| `init_schema()` | `None` | Idempotent (`CREATE TABLE IF NOT EXISTS`). |
| `reset_all_data()` | `None` | Deletes every row; tables stay. For demo seeding and tests. |

### People

| Method | Returns | Behaviour & errors |
| --- | --- | --- |
| `create_person(new_person: PersonCreate)` | `Person` |  |
| `get_person(person_id)` | `Person` | `NotFoundError`. Not access-checked: name and phone are not restricted. |
| `update_person(person_id, changes: PersonUpdate)` | `Person` | Only fields set in `changes` are written. `NotFoundError`. |
| `list_people_in_network(network_id, viewer_id)` | `list[Person]` | Ordered by id. |

### Care networks

| Method | Returns | Behaviour & errors |
| --- | --- | --- |
| `create_care_network(new_network: CareNetworkCreate)` | `CareNetwork` | Adds the patient as a member. `NotFoundError` if the patient doesn't exist; `ConflictError` if that person isn't `person_type = patient` or already has a network. |
| `get_care_network(network_id, viewer_id)` | `CareNetwork` | `NotFoundError`, `AccessDeniedError`. |
| `list_networks_for_person(person_id)` | `list[CareNetwork]` | Networks the person belongs to; for the post-login landing page. |
| `add_network_member(network_id, person_id)` | `None` | Idempotent. `NotFoundError` for either id. |
| `remove_network_member(network_id, person_id)` | `None` | Also deletes their assignments, relationships and grant in this network. `ConflictError` when removing the patient. |

### Graph

| Method | Returns | Behaviour & errors |
| --- | --- | --- |
| `create_relationship(new_relationship: RelationshipCreate)` | `Relationship` | `ConflictError` if either end isn't a member or source equals target. |
| `delete_relationship(relationship_id)` | `None` | `NotFoundError`. |
| `get_network_graph(network_id, viewer_id)` | `NetworkGraph` | `nodes` = members (by id), `edges` = relationships (by id), redacted as needed. |

### Tasks

Every returned `Task` carries its `assignments` list, so gap detection is `len(task.assignments) == 0` (unowned) or `task.is_exclusive and len(task.assignments) >= 2` (redundant).

| Method | Returns | Behaviour & errors |
| --- | --- | --- |
| `create_task(new_task: TaskCreate)` | `Task` | Starts with no assignments. `NotFoundError` for an unknown network. |
| `get_task(task_id, viewer_id)` | `Task` | `NotFoundError`, `AccessDeniedError`. |
| `update_task(task_id, changes: TaskUpdate)` | `Task` | Partial update; returned unredacted. |
| `delete_task(task_id)` | `None` | Deletes its assignments and any gaps linked to it. |
| `list_tasks(network_id, viewer_id)` | `list[Task]` | Ordered by `due_date` (nulls last), then id. |
| `list_tasks_for_person(network_id, person_id, viewer_id)` | `list[Task]` | Tasks the person is assigned to; same ordering. |

### Assignments

| Method | Returns | Behaviour & errors |
| --- | --- | --- |
| `assign_task(task_id, person_id)` | `TaskAssignment` | Status starts `pending`. Idempotent: returns the existing row. **Never rejects a second owner on an exclusive task.** `ConflictError` if the person isn't a member. |
| `unassign_task(task_id, person_id)` | `None` | `NotFoundError` if not assigned. |
| `set_assignment_status(task_id, person_id, status)` | `TaskAssignment` | Updates `updated_at`. `NotFoundError` if not assigned. |

### Availability

| Method | Returns | Behaviour & errors |
| --- | --- | --- |
| `replace_availability(person_id, windows: list[AvailabilityWindowCreate])` | `list[AvailabilityWindow]` | Replaces all of the person's windows. Validation: `start_time < end_time`. |
| `get_availability(person_id)` | `list[AvailabilityWindow]` | Ordered by weekday, then start time. |
| `list_availability_in_network(network_id, viewer_id)` | `dict[int, list[AvailabilityWindow]]` | Keyed by person id; every member present, empty list if none. |

### Care plans

| Method | Returns | Behaviour & errors |
| --- | --- | --- |
| `create_care_plan(new_plan: CarePlanCreate)` | `CarePlan` | `ConflictError` if the author isn't a member. |
| `get_care_plan(care_plan_id, viewer_id)` | `CarePlan` | `NotFoundError`, `AccessDeniedError`. |
| `list_care_plans(network_id, viewer_id)` | `list[CarePlan]` | Ordered by id. |

### Gaps

| Method | Returns | Behaviour & errors |
| --- | --- | --- |
| `replace_open_gaps(network_id, new_gaps: list[GapCreate])` | `list[Gap]` | Atomically deletes the network's **open** gaps and inserts `new_gaps` as open. Resolved gaps are untouched. The engine calls this once per run. |
| `list_gaps(network_id, viewer_id, status=GapStatus.open)` | `list[Gap]` | `status=None` returns both. Ordered high → low severity, then id. |
| `resolve_gap(gap_id, resolved_by_person_id)` | `Gap` | Sets `resolved_at`. Idempotent. A resolved gap whose condition still holds reappears as a new open gap on the next engine run. |

### Check-ins and burnout

| Method | Returns | Behaviour & errors |
| --- | --- | --- |
| `create_checkin(new_checkin: CheckinCreate)` | `Checkin` | `sentiment_score` must already be set by the caller. |
| `list_checkins(network_id, person_id, viewer_id, limit=50)` | `list[Checkin]` | Newest first. `AccessDeniedError` unless viewer is the person or system. |
| `record_burnout_score(new_score: BurnoutScoreCreate)` | `BurnoutScore` | Appends; never overwrites. |
| `list_latest_burnout_scores(network_id, viewer_id)` | `list[BurnoutScore]` | One row per member that has a score (their newest). Ordered by score, highest first. |
| `get_burnout_history(network_id, person_id, viewer_id, limit=30)` | `list[BurnoutScore]` | The newest `limit` rows, returned oldest → newest for charting. |

### Access control

| Method | Returns | Behaviour & errors |
| --- | --- | --- |
| `grant_restricted_access(network_id, grantee_person_id, granted_by_person_id)` | `AccessGrant` | Idempotent. `AccessDeniedError` unless granter is the patient or system; `ConflictError` if the grantee isn't a member. |
| `revoke_restricted_access(network_id, grantee_person_id, revoked_by_person_id)` | `None` | No-op if there was no grant. Same `AccessDeniedError` rule. |
| `list_access_grants(network_id, viewer_id)` | `list[AccessGrant]` | Membership-checked. |
| `can_view_restricted(network_id, viewer_id)` | `bool` | The rule from Access control step 2; for the API to show lock icons. Returns `False` for non-members instead of raising. |

## Conventions & errors

A fake passes if it matches these conventions and the checklist below; nothing else about its internals matters.

| Exception (from `db_contract.py`) | Raised when | Map to HTTP |
| --- | --- | --- |
| `NotFoundError` | An id doesn't exist. | 404 |
| `AccessDeniedError` | Viewer isn't a network member, reads someone else's check-ins, or a non-patient grants/revokes. | 403 |
| `ConflictError` | The request contradicts current state (non-member assignee, second network for a patient, removing the patient). | 409 |
| `pydantic.ValidationError` | Bad input shape or enum value; raised when the `*Create` model is built, before `DBManager` is called. | 422 (FastAPI default) |

All three custom exceptions subclass `DatabaseError`, so one FastAPI exception handler can map them.

- **Ids** are ints starting at 1. `0` is reserved for `SYSTEM_VIEWER_ID`; fakes must start their counters at 1 too.
- **Time** values are timezone-aware UTC `datetime`; `due_date` is a `date`; availability uses `time`.
- **Returned objects are copies.** Mutating one never changes stored data, so fakes must return `model_copy(deep=True)`.
- **Ordering** is ascending by id unless a method says otherwise. Tests and the demo rely on it.
- **Concurrency:** one shared `aiosqlite` connection per process is fine at hackathon scale; calls are serialized.

Checklist for a `FakeDBManager`:

- [ ] Membership check and redaction on every read that takes `viewer_id`, with `SYSTEM_VIEWER_ID` seeing everything
- [ ] `assign_task` accepts a second owner on an exclusive task
- [ ] `replace_open_gaps` keeps resolved gaps and swaps only open ones
- [ ] Idempotent: `add_network_member`, `assign_task`, `grant_restricted_access`, `resolve_gap`
- [ ] Cascades: `delete_task` and `remove_network_member` clean up dependent rows
- [ ] `create_care_network` adds the patient as a member

## Decisions beyond the draft

Ten choices this contract makes that your draft left open; each is a one-line change in `db_contract.py` if you'd rather go the other way. All names are proposals — rename freely, and everyone picks it up on import.

| Decision | Why |
| --- | --- |
| `network_members` join table instead of a `network_id` column on `people` | A pharmacist or nurse can serve several patients without duplicate person rows. |
| `sensitivity` on tasks, relationships and care plans, plus `access_grants` and `is_physician` | Minimum needed for the "doctors + whoever the patient chooses" rule. Grants are per network, not per item. |
| Redact restricted items instead of hiding them | Everyone sees the same graph shape and gap count; only the content is hidden. |
| `viewer_id` on every network read, with `SYSTEM_VIEWER_ID = 0` | Access control lives in one place and can't be skipped by an endpoint. |
| `Task` embeds its `assignments` | Gap detection and role views need both; saves a second query everywhere. |
| `assign_task` never blocks double ownership | Redundancy is a gap to detect, not an error to prevent. |
| `replace_open_gaps` instead of insert/update per gap | The engine re-runs from scratch; no duplicate or stale open gaps. Gap ids change between runs. |
| Added gap kind `missed` and `related_care_plan_ids` | Missed meds are in your problem statement; plan conflicts link care plans, not tasks. |
| `burnout_scores` is append-only | Trends come free from history. |
| Assignment `status` is the current cycle for recurring tasks | No per-occurrence history table; enough for the demo, a known limit afterwards. |
