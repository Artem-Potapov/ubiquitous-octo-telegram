"""Bodies that only exist at the HTTP layer. Everything else comes from db_contract."""
from datetime import date

from sqlmodel import SQLModel

from db.db_contract import AssignmentStatus


class AssignmentStatusUpdate(SQLModel):
    status: AssignmentStatus


class GapResolve(SQLModel):
    resolved_by_person_id: int


class PatientProfile(SQLModel):
    """Overview header. NOT in the DB contract: served from api/demo_data.py for now."""
    person_id: int
    age: int
    location: str
    headline: str
    discharged_on: date
