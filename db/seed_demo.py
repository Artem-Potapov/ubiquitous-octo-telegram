"""
Seed the database with the synthetic Lindqvist demo network.

Entirely fictional data: no real patient information. It goes through the abstract
DBManager API only, so it works with the SQLite implementation (once every method it
calls is implemented) and with any fake that follows the contract.

Run from the repo root:

    python -m db.seed_demo                      # seed constellation.db
    python -m db.seed_demo --db demo.db --reset # wipe first (needs reset_all_data)
    python -m db.seed_demo --sample-plans       # also add the two conflicting care plans
    python -m db.seed_demo --no-gaps            # leave gap detection to the engine

Built-in coordination problems the demo is designed to show:
  1. Furosemide refill pickup with no owner                -> unowned gap
  2. Cardiology follow-up booked by both Margaret & Elena  -> redundant gap
  3. Daniel missed the post-discharge follow-up call       -> missed gap
  4. Margaret carries ~85% of family care tasks            -> burnout warning
  5. Conflicting fluid guidance across two care plans      -> plan conflict (--sample-plans)
  6. Behavioral-health items marked restricted             -> access-control demo

Run it once on an empty database. Without --reset a second run adds a second copy,
and create_care_network raises ConflictError because the patient already has one.
"""
from __future__ import annotations

import argparse
import asyncio
from datetime import date, time, timedelta

from db.db_contract import (
    AssignmentStatus,
    AvailabilityWindowCreate,
    BurnoutScoreCreate,
    CarePlanCreate,
    CareNetworkCreate,
    CheckinCreate,
    DBManager,
    GapCreate,
    GapKind,
    GapSeverity,
    PersonCreate,
    PersonType,
    RelationshipCreate,
    Sensitivity,
    TaskCategory,
    TaskCreate,
    TaskFrequency,
)

NETWORK_NAME = "Walter's Care Constellation"

PENDING = AssignmentStatus.pending
DONE = AssignmentStatus.done
MISSED = AssignmentStatus.missed

# ---------------------------------------------------------------------------
# Data
# ---------------------------------------------------------------------------

# key, person_type, subrole, full_name, phone_number, is_physician
PEOPLE = [
    ("walter", PersonType.patient, "patient", "Walter Lindqvist", "(612) 555-0141", False),
    ("margaret", PersonType.family, "spouse", "Margaret Lindqvist", "(612) 555-0142", False),
    ("daniel", PersonType.family, "son", "Daniel Lindqvist", "(612) 555-0177", False),
    ("elena", PersonType.family, "daughter", "Elena Lindqvist-Ortiz", "(651) 555-0119", False),
    ("tom", PersonType.family, "neighbor", "Tom Reyes", "(612) 555-0163", False),
    ("okafor", PersonType.professional, "cardiologist", "Dr. Amara Okafor", "(612) 555-0100", True),
    ("whitfield", PersonType.professional, "primary care physician", "Dr. James Whitfield", "(612) 555-0101", True),
    ("rachel", PersonType.professional, "home health nurse", "Rachel Kim, RN", "(612) 555-0122", False),
    ("marcus", PersonType.professional, "pharmacist", "Marcus Bell, PharmD", "(612) 555-0190", False),
]

# source, target, label, sensitivity
RELATIONSHIPS = [
    ("margaret", "walter", "Spouse · primary daily caregiver", Sensitivity.normal),
    ("daniel", "walter", "Son · evening & weekend help", Sensitivity.normal),
    ("elena", "walter", "Daughter · keeps the family updated", Sensitivity.normal),
    ("tom", "walter", "Neighbor · rides & groceries", Sensitivity.normal),
    ("okafor", "walter", "Cardiologist · heart-failure care", Sensitivity.normal),
    ("whitfield", "walter", "Primary care · diabetes management", Sensitivity.normal),
    ("rachel", "walter", "Home health visits twice a week", Sensitivity.normal),
    ("marcus", "walter", "Fills all prescriptions", Sensitivity.normal),
    ("okafor", "marcus", "Sends heart-failure prescriptions", Sensitivity.normal),
    ("whitfield", "marcus", "Sends diabetes prescriptions", Sensitivity.normal),
    ("rachel", "okafor", "Reports weights & vitals", Sensitivity.normal),
    ("whitfield", "rachel", "Coordinates mood screening during visits", Sensitivity.restricted),
    ("margaret", "tom", "Coordinates rides & groceries", Sensitivity.normal),
]

M, C, T, H, CM, O = (
    TaskCategory.medication,
    TaskCategory.appointment,
    TaskCategory.monitoring,
    TaskCategory.transport,
    TaskCategory.household,
    TaskCategory.communication,
)
ONCE, DAILY, WEEKLY, MONTHLY, AS_NEEDED = (
    TaskFrequency.once,
    TaskFrequency.daily,
    TaskFrequency.weekly,
    TaskFrequency.monthly,
    TaskFrequency.as_needed,
)
NORMAL, RESTRICTED = Sensitivity.normal, Sensitivity.restricted

# key, title, category, required_role, frequency, due in N days (None = no date),
# is_exclusive, sensitivity, created_by, [(owner, status), ...]
TASKS = [
    ("refill", "Pick up furosemide refill from Northside Pharmacy", M, "family", ONCE, 1, True, NORMAL, "marcus", []),
    ("med_rec", "Post-discharge medication reconciliation", M, "pharmacist", ONCE, 3, True, NORMAL, "okafor", []),
    ("cardio_book", "Book cardiology follow-up appointment", C, "family", ONCE, 2, True, NORMAL, "okafor",
     [("margaret", PENDING), ("elena", PENDING)]),
    ("followup_call", "Follow-up call with Dr. Whitfield's office after discharge", O, "family", ONCE, -3, True, NORMAL,
     "whitfield", [("daniel", MISSED)]),
    ("morning_meds", "Morning medications & blood-glucose check", M, "spouse", DAILY, None, True, NORMAL, "whitfield",
     [("margaret", PENDING)]),
    ("evening_meds", "Evening medication reminder", M, "family", DAILY, None, True, NORMAL, "whitfield",
     [("margaret", PENDING)]),
    ("dinners", "Prepare low-sodium dinners", CM, "family", DAILY, None, False, NORMAL, "okafor",
     [("margaret", PENDING)]),
    ("pill_organizer", "Fill weekly pill organizer", M, "family", WEEKLY, None, True, NORMAL, "marcus",
     [("margaret", PENDING)]),
    ("groceries", "Grocery shopping", CM, None, WEEKLY, None, False, NORMAL, "margaret",
     [("margaret", PENDING), ("tom", PENDING)]),
    ("laundry", "Laundry & housekeeping", CM, "family", WEEKLY, None, False, NORMAL, "margaret",
     [("margaret", PENDING)]),
    ("bills", "Pay pharmacy & medical bills", CM, "family", MONTHLY, None, True, NORMAL, "margaret",
     [("margaret", PENDING)]),
    ("weight", "Daily weight check & log", T, None, DAILY, None, True, NORMAL, "okafor", [("walter", PENDING)]),
    ("drive", "Drive Walter to cardiology appointment", H, "family", ONCE, 5, True, NORMAL, "margaret",
     [("tom", PENDING)]),
    ("home_visit", "Home health visit: vitals & medication review", T, "home health nurse", WEEKLY, 2, True, NORMAL,
     "whitfield", [("rachel", PENDING)]),
    ("refill_check", "Weekly refill & adherence check", M, "pharmacist", WEEKLY, None, True, NORMAL, "marcus",
     [("marcus", PENDING)]),
    ("adjust_meds", "Adjust heart-failure medications as needed", M, "cardiologist", AS_NEEDED, None, True, NORMAL,
     "okafor", [("okafor", PENDING)]),
    ("phq9", "Monthly PHQ-9 mood screening", T, "primary care physician", MONTHLY, 12, True, RESTRICTED, "whitfield",
     [("whitfield", PENDING)]),
    ("bh_followup", "Schedule behavioral health follow-up", C, "primary care physician", ONCE, 10, True, RESTRICTED,
     "whitfield", []),
    ("family_call", "Weekly family update call", O, None, WEEKLY, None, False, NORMAL, "elena",
     [("elena", PENDING)]),
    ("grab_bars", "Install bathroom grab bars", CM, "family", ONCE, -6, True, NORMAL, "margaret",
     [("daniel", DONE)]),
    ("labs", "Review diabetes labs (A1C)", T, "primary care physician", ONCE, 7, True, NORMAL, "whitfield",
     [("whitfield", PENDING)]),
]


def _every_day(start: str, end: str) -> list[tuple[int, str, str]]:
    return [(d, start, end) for d in range(7)]


def _days(days: list[int], start: str, end: str) -> list[tuple[int, str, str]]:
    return [(d, start, end) for d in days]


# person key -> [(weekday 0=Mon, start, end)]
AVAILABILITY = {
    "margaret": _every_day("07:00", "21:00"),
    "daniel": _days([0, 1, 2, 3, 4], "17:30", "21:00") + [(5, "09:00", "17:00")],
    "elena": _every_day("16:00", "20:00"),
    "tom": [(1, "09:00", "12:00"), (3, "09:00", "12:00"), (5, "10:00", "14:00")],
    "okafor": _days([0, 2, 4], "08:00", "16:00"),
    "whitfield": _days([0, 1, 2, 3], "08:00", "17:00"),
    "rachel": [(1, "09:00", "15:00"), (4, "09:00", "15:00")],
    "marcus": _days([0, 1, 2, 3, 4, 5], "09:00", "19:00"),
}

# author, title, sensitivity, text
CARE_PLANS = [
    ("whitfield", "Behavioral health plan", RESTRICTED,
     "Mild depressive symptoms following hospitalization. Sertraline 50 mg daily. Monthly PHQ-9 screening. "
     "Refer to behavioral health for follow-up within two weeks. Share only with people Walter approves."),
    ("rachel", "Home health nursing plan", NORMAL,
     "Twice-weekly visits for vitals, edema check, and medication review. Teach Walter and family to recognise "
     "warning signs of fluid overload."),
]

# Added with --sample-plans. Together they contradict each other on fluid intake.
SAMPLE_PLANS = [
    ("okafor", "Heart failure management plan", NORMAL,
     "Furosemide 40 mg each morning. Fluid restriction: no more than 1.5 L per day. Weigh daily before breakfast; "
     "call the clinic for a gain of more than 2 lb in a day or 5 lb in a week. Sodium under 2 g per day."),
    ("whitfield", "Type 2 diabetes management plan", NORMAL,
     "Metformin 1000 mg twice daily with meals. Fasting blood glucose each morning. Encourage 2–2.5 L of fluid "
     "intake daily to prevent dehydration. A1C recheck in one week."),
]

# person, message, sentiment (-1..1)
CHECKINS = [
    ("margaret", "I haven't had a full night's sleep since Walter came home. I'm doing almost everything myself.", -0.7),
    ("margaret", "Tired, but managing. Wish I had more help with dinners.", -0.4),
    ("daniel", "Busy week at work — sorry I missed the call with the clinic.", 0.1),
    ("elena", "Happy to help more if someone tells me what is needed.", 0.5),
]

# person, score, task_share, missed_count, sentiment_average. Illustrative heuristic
# (65 x share of family load + up to 15 for missed tasks + up to 20 for low sentiment),
# worked out for the tasks above. The scoring engine appends newer rows later.
BURNOUT = [
    ("margaret", 66, 0.846, 0, -0.55),
    ("daniel", 12, 0.034, 1, 0.1),
    ("elena", 4, 0.068, 0, 0.5),
    ("tom", 3, 0.051, 0, None),
]

# People Walter shares restricted information with. Physicians always have access.
GRANTS = ["margaret", "daniel"]


# ---------------------------------------------------------------------------
# Seeding
# ---------------------------------------------------------------------------

def _due(days_from_today: int | None) -> date | None:
    return None if days_from_today is None else date.today() + timedelta(days=days_from_today)


async def seed(db: DBManager, *, sample_plans: bool = False, with_gaps: bool = True) -> dict[str, int]:
    """Insert the demo network through `db` and return how many rows of each kind were added.

    The schema must already exist. Expects an empty database (see the module docstring).
    """
    people = {}
    for key, person_type, subrole, full_name, phone, is_physician in PEOPLE:
        people[key] = await db.create_person(PersonCreate(
            person_type=person_type, subrole=subrole, full_name=full_name,
            phone_number=phone, is_physician=is_physician,
        ))
    pid = {key: person.id for key, person in people.items()}

    network = await db.create_care_network(CareNetworkCreate(patient_id=pid["walter"], network_name=NETWORK_NAME))
    for key, person_id in pid.items():
        if key != "walter":  # create_care_network already added the patient
            await db.add_network_member(network.id, person_id)

    for source, target, label, sensitivity in RELATIONSHIPS:
        await db.create_relationship(RelationshipCreate(
            network_id=network.id, source_person_id=pid[source], target_person_id=pid[target],
            label=label, sensitivity=sensitivity,
        ))

    tasks = {}
    assignments = 0
    for key, title, category, role, frequency, due, exclusive, sensitivity, created_by, owners in TASKS:
        tasks[key] = await db.create_task(TaskCreate(
            network_id=network.id, title=title, category=category, required_role=role, frequency=frequency,
            due_date=_due(due), is_exclusive=exclusive, sensitivity=sensitivity, created_by_person_id=pid[created_by],
        ))
        for owner, status in owners:
            await db.assign_task(tasks[key].id, pid[owner])
            if status != AssignmentStatus.pending:
                await db.set_assignment_status(tasks[key].id, pid[owner], status)
            assignments += 1

    for key, windows in AVAILABILITY.items():
        await db.replace_availability(pid[key], [
            AvailabilityWindowCreate(weekday=day, start_time=time.fromisoformat(start), end_time=time.fromisoformat(end))
            for day, start, end in windows
        ])

    plans = {}
    for author, title, sensitivity, text in CARE_PLANS + (SAMPLE_PLANS if sample_plans else []):
        plans[title] = await db.create_care_plan(CarePlanCreate(
            network_id=network.id, author_person_id=pid[author], title=title, raw_text=text, sensitivity=sensitivity,
        ))

    for person, message, sentiment in CHECKINS:
        await db.create_checkin(CheckinCreate(
            person_id=pid[person], network_id=network.id, message=message, sentiment_score=sentiment,
        ))

    for person, score, share, missed, sentiment in BURNOUT:
        await db.record_burnout_score(BurnoutScoreCreate(
            person_id=pid[person], network_id=network.id, score=score, task_share=share,
            missed_count=missed, sentiment_average=sentiment,
        ))

    for grantee in GRANTS:
        await db.grant_restricted_access(network.id, pid[grantee], pid["walter"])

    gaps = []
    if with_gaps:
        gaps = [
            GapCreate(
                gap_kind=GapKind.unowned, severity=GapSeverity.high, task_id=tasks["refill"].id,
                suggested_assignee_id=pid["elena"],
                description='"Pick up furosemide refill from Northside Pharmacy" has no owner. '
                            "Everyone may be assuming someone else is handling it.",
            ),
            GapCreate(
                gap_kind=GapKind.missed, severity=GapSeverity.high, task_id=tasks["followup_call"].id,
                suggested_assignee_id=pid["elena"],
                description="Daniel was responsible for \"Follow-up call with Dr. Whitfield's office after "
                            "discharge\" and it was marked missed. Nobody has followed up yet.",
            ),
            GapCreate(
                gap_kind=GapKind.unowned, severity=GapSeverity.medium, task_id=tasks["med_rec"].id,
                suggested_assignee_id=pid["marcus"],
                description='"Post-discharge medication reconciliation" has no owner. '
                            "Everyone may be assuming someone else is handling it.",
            ),
            GapCreate(
                gap_kind=GapKind.redundant, severity=GapSeverity.medium, task_id=tasks["cardio_book"].id,
                suggested_assignee_id=pid["elena"],
                description='"Book cardiology follow-up appointment" should have one owner, but Margaret and '
                            "Elena are both assigned. They may duplicate work or give conflicting information.",
            ),
            GapCreate(
                gap_kind=GapKind.unowned, severity=GapSeverity.low, task_id=tasks["bh_followup"].id,
                suggested_assignee_id=pid["whitfield"],
                description='"Schedule behavioral health follow-up" has no owner. '
                            "Everyone may be assuming someone else is handling it.",
            ),
        ]
        if sample_plans:
            hf, diabetes = plans["Heart failure management plan"], plans["Type 2 diabetes management plan"]
            gaps.append(GapCreate(
                gap_kind=GapKind.plan_conflict, severity=GapSeverity.medium, suggested_assignee_id=pid["okafor"],
                related_care_plan_ids=[hf.id, diabetes.id],
                description='Fluid guidance conflicts: "Heart failure management plan" limits fluids, while '
                            '"Type 2 diabetes management plan" encourages higher intake. '
                            "Caregivers cannot follow both.",
            ))
        await db.replace_open_gaps(network.id, gaps)

    return {
        "people": len(people),
        "relationships": len(RELATIONSHIPS),
        "tasks": len(tasks),
        "assignments": assignments,
        "care_plans": len(plans),
        "checkins": len(CHECKINS),
        "burnout_scores": len(BURNOUT),
        "access_grants": len(GRANTS),
        "gaps": len(gaps),
    }


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

async def _main() -> None:
    parser = argparse.ArgumentParser(description="Seed the Lindqvist synthetic demo data.")
    parser.add_argument("--db", default="constellation.db", help="SQLite file (default: constellation.db)")
    parser.add_argument("--reset", action="store_true", help="delete all existing rows first")
    parser.add_argument("--sample-plans", action="store_true", help="also add the two conflicting care plans")
    parser.add_argument("--no-gaps", action="store_true", help="do not insert gaps; let the engine detect them")
    args = parser.parse_args()

    # Imported here so the data above can be reused with any DBManager without SQLAlchemy installed.
    from db.db_manager import SQLiteDBManager

    db = SQLiteDBManager(args.db)
    await db.connect()
    try:
        await db.init_schema()
        if args.reset:
            await db.reset_all_data()
        counts = await seed(db, sample_plans=args.sample_plans, with_gaps=not args.no_gaps)
    except NotImplementedError as error:
        raise SystemExit(
            "The database manager does not implement every method the seed needs yet "
            f"({error!r}). Finish SQLiteDBManager, or run seed() against a complete DBManager."
        ) from error
    finally:
        await db.close()

    print(f"Seeded {args.db}: " + ", ".join(f"{n} {kind.replace('_', ' ')}" for kind, n in counts.items()))


if __name__ == "__main__":
    asyncio.run(_main())
