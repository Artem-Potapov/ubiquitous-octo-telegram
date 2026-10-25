"""
Static demo data for things the DB contract does not hold yet.
Mirrors patientProfile in the frontend's src/data/demoScenario.ts.
"""
from datetime import date, timedelta

from api.schemas import PatientProfile

DEMO_PATIENT_AGE = 74
DEMO_PATIENT_LOCATION = "Minneapolis, MN"
DEMO_PATIENT_HEADLINE = "Recently discharged after a heart-failure hospitalization"
DEMO_DAYS_SINCE_DISCHARGE = 4


def demo_patient_profile(patient_id: int) -> PatientProfile:
    """The same profile for every network; the discharge date stays relative to today."""
    return PatientProfile(
        person_id=patient_id,
        age=DEMO_PATIENT_AGE,
        location=DEMO_PATIENT_LOCATION,
        headline=DEMO_PATIENT_HEADLINE,
        discharged_on=date.today() - timedelta(days=DEMO_DAYS_SINCE_DISCHARGE),
    )
