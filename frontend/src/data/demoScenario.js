// Entirely fictional, synthetic demo data. No real patient information.
//
// Shapes match db_contract.py so the same records could be seeded into the
// real SQLite database. Dates are relative to "today" so the demo always looks
// current. Built-in coordination problems the demo is designed to show:
//   1. Furosemide refill pickup with no owner                -> unowned gap
//   2. Cardiology follow-up booked by both Margaret & Elena  -> redundant gap
//   3. Daniel missed the post-discharge follow-up call       -> missed gap
//   4. Margaret carries ~85% of family care tasks            -> workload imbalance
//   5. Conflicting fluid guidance across two care plans      -> plan conflict
//   6. Behavioral-health items marked restricted             -> privacy demo

import { daysFromToday } from '../domain/dates'

const daysAgoTimestamp = (n, hour = 10) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(hour, 0, 0, 0)
  return d.toISOString()
}

export const DEMO_NETWORK_ID = 1

export function buildDemoScenario() {
  const people = [
    { id: 1, person_type: 'patient', subrole: 'patient', full_name: 'Walter Lindqvist', phone_number: '(612) 555-0141', is_physician: false },
    { id: 2, person_type: 'family', subrole: 'spouse', full_name: 'Margaret Lindqvist', phone_number: '(612) 555-0142', is_physician: false },
    { id: 3, person_type: 'family', subrole: 'son', full_name: 'Daniel Lindqvist', phone_number: '(612) 555-0177', is_physician: false },
    { id: 4, person_type: 'family', subrole: 'daughter', full_name: 'Elena Lindqvist-Ortiz', phone_number: '(651) 555-0119', is_physician: false },
    { id: 5, person_type: 'family', subrole: 'neighbor', full_name: 'Tom Reyes', phone_number: '(612) 555-0163', is_physician: false },
    { id: 6, person_type: 'professional', subrole: 'cardiologist', full_name: 'Dr. Amara Okafor', phone_number: '(612) 555-0100', is_physician: true },
    { id: 7, person_type: 'professional', subrole: 'primary care physician', full_name: 'Dr. James Whitfield', phone_number: '(612) 555-0101', is_physician: true },
    { id: 8, person_type: 'professional', subrole: 'home health nurse', full_name: 'Rachel Kim, RN', phone_number: '(612) 555-0122', is_physician: false },
    { id: 9, person_type: 'professional', subrole: 'pharmacist', full_name: 'Marcus Bell, PharmD', phone_number: '(612) 555-0190', is_physician: false },
  ].map((p) => ({ ...p, created_at: daysAgoTimestamp(30) }))

  const network = {
    id: DEMO_NETWORK_ID,
    patient_id: 1,
    network_name: "Walter's Care Constellation",
    created_at: daysAgoTimestamp(30),
  }

  const relationships = [
    [2, 1, 'Spouse · primary daily caregiver'],
    [3, 1, 'Son · evening & weekend help'],
    [4, 1, 'Daughter · keeps the family updated'],
    [5, 1, 'Neighbor · rides & groceries'],
    [6, 1, 'Cardiologist · heart-failure care'],
    [7, 1, 'Primary care · diabetes management'],
    [8, 1, 'Home health visits twice a week'],
    [9, 1, 'Fills all prescriptions'],
    [6, 9, 'Sends heart-failure prescriptions'],
    [7, 9, 'Sends diabetes prescriptions'],
    [8, 6, 'Reports weights & vitals'],
    [7, 8, 'Coordinates mood screening during visits', 'restricted'],
    [2, 5, 'Coordinates rides & groceries'],
  ].map(([source, target, label, sensitivity = 'normal'], i) => ({
    id: i + 1,
    network_id: DEMO_NETWORK_ID,
    source_person_id: source,
    target_person_id: target,
    label,
    sensitivity,
    created_at: daysAgoTimestamp(30),
  }))

  // [title, category, required_role, frequency, dueOffsetDays|null, is_exclusive,
  //  sensitivity, created_by, assignments: [[person_id, status], ...]]
  const taskRows = [
    ['Pick up furosemide refill from Northside Pharmacy', 'medication', 'family', 'once', 1, true, 'normal', 9, []],
    ['Post-discharge medication reconciliation', 'medication', 'pharmacist', 'once', 3, true, 'normal', 6, []],
    ['Book cardiology follow-up appointment', 'appointment', 'family', 'once', 2, true, 'normal', 6, [[2, 'pending'], [4, 'pending']]],
    ["Follow-up call with Dr. Whitfield's office after discharge", 'communication', 'family', 'once', -3, true, 'normal', 7, [[3, 'missed']]],
    ['Morning medications & blood-glucose check', 'medication', 'spouse', 'daily', null, true, 'normal', 7, [[2, 'pending']]],
    ['Evening medication reminder', 'medication', 'family', 'daily', null, true, 'normal', 7, [[2, 'pending']]],
    ['Prepare low-sodium dinners', 'household', 'family', 'daily', null, false, 'normal', 6, [[2, 'pending']]],
    ['Fill weekly pill organizer', 'medication', 'family', 'weekly', null, true, 'normal', 9, [[2, 'pending']]],
    ['Grocery shopping', 'household', null, 'weekly', null, false, 'normal', 2, [[2, 'pending'], [5, 'pending']]],
    ['Laundry & housekeeping', 'household', 'family', 'weekly', null, false, 'normal', 2, [[2, 'pending']]],
    ['Pay pharmacy & medical bills', 'household', 'family', 'monthly', null, true, 'normal', 2, [[2, 'pending']]],
    ['Daily weight check & log', 'monitoring', null, 'daily', null, true, 'normal', 6, [[1, 'pending']]],
    ['Drive Walter to cardiology appointment', 'transport', 'family', 'once', 5, true, 'normal', 2, [[5, 'pending']]],
    ['Home health visit: vitals & medication review', 'monitoring', 'home health nurse', 'weekly', 2, true, 'normal', 7, [[8, 'pending']]],
    ['Weekly refill & adherence check', 'medication', 'pharmacist', 'weekly', null, true, 'normal', 9, [[9, 'pending']]],
    ['Adjust heart-failure medications as needed', 'medication', 'cardiologist', 'as_needed', null, true, 'normal', 6, [[6, 'pending']]],
    ['Monthly PHQ-9 mood screening', 'monitoring', 'primary care physician', 'monthly', 12, true, 'restricted', 7, [[7, 'pending']]],
    ['Schedule behavioral health follow-up', 'appointment', 'primary care physician', 'once', 10, true, 'restricted', 7, []],
    ['Weekly family update call', 'communication', null, 'weekly', null, false, 'normal', 4, [[4, 'pending']]],
    ['Install bathroom grab bars', 'household', 'family', 'once', -6, true, 'normal', 2, [[3, 'done']]],
    ['Review diabetes labs (A1C)', 'monitoring', 'primary care physician', 'once', 7, true, 'normal', 7, [[7, 'pending']]],
  ]

  let assignmentId = 1
  const tasks = taskRows.map(
    ([title, category, required_role, frequency, due, is_exclusive, sensitivity, created_by, assigned], i) => ({
      id: i + 1,
      network_id: DEMO_NETWORK_ID,
      title,
      category,
      required_role,
      frequency,
      due_date: due === null ? null : daysFromToday(due),
      is_exclusive,
      sensitivity,
      created_by_person_id: created_by,
      created_at: daysAgoTimestamp(10),
      assignments: assigned.map(([person_id, status], j) => ({
        id: assignmentId++,
        task_id: i + 1,
        person_id,
        status,
        assigned_at: daysAgoTimestamp(6 - j, 9 + j * 5),
        updated_at: daysAgoTimestamp(status === 'missed' ? 2 : 6 - j, 9 + j * 5),
      })),
    }),
  )

  const window = (weekday, start_time, end_time) => ({ weekday, start_time, end_time })
  const everyDay = (start, end) => [0, 1, 2, 3, 4, 5, 6].map((d) => window(d, start, end))
  const availability = {
    1: [],
    2: everyDay('07:00', '21:00'),
    3: [0, 1, 2, 3, 4].map((d) => window(d, '17:30', '21:00')).concat(window(5, '09:00', '17:00')),
    4: everyDay('16:00', '20:00'),
    5: [window(1, '09:00', '12:00'), window(3, '09:00', '12:00'), window(5, '10:00', '14:00')],
    6: [0, 2, 4].map((d) => window(d, '08:00', '16:00')),
    7: [0, 1, 2, 3].map((d) => window(d, '08:00', '17:00')),
    8: [window(1, '09:00', '15:00'), window(4, '09:00', '15:00')],
    9: [0, 1, 2, 3, 4, 5].map((d) => window(d, '09:00', '19:00')),
  }

  const carePlans = [
    // The heart-failure and diabetes plans are NOT seeded: the demo uploads them
    // (see src/api/samplePlans.ts) so the conflict appears live.
    {
      id: 3,
      author_person_id: 7,
      title: 'Behavioral health plan',
      raw_text:
        'Mild depressive symptoms following hospitalization. Sertraline 50 mg daily. Monthly PHQ-9 screening. Refer to behavioral health for follow-up within two weeks. Share only with people Walter approves.',
      sensitivity: 'restricted',
    },
    {
      id: 4,
      author_person_id: 8,
      title: 'Home health nursing plan',
      raw_text:
        'Twice-weekly visits for vitals, edema check, and medication review. Teach Walter and family to recognise warning signs of fluid overload.',
      sensitivity: 'normal',
    },
  ].map((p) => ({ ...p, network_id: DEMO_NETWORK_ID, created_at: daysAgoTimestamp(5) }))

  // Produced by the optional AI care-plan review (Gemini on the backend). The
  // demo keeps a canned result so the core experience never depends on an LLM.
  // Filled when care plans are analyzed (mockBackend.analyzeCarePlans).
  const aiPlanConflicts = []

  const checkins = [
    [2, "I haven't had a full night's sleep since Walter came home. I'm doing almost everything myself.", -0.7, 3],
    [2, 'Tired, but managing. Wish I had more help with dinners.', -0.4, 9],
    [3, 'Busy week at work — sorry I missed the call with the clinic.', 0.1, 2],
    [4, 'Happy to help more if someone tells me what is needed.', 0.5, 4],
  ].map(([person_id, message, sentiment_score, ago], i) => ({
    id: i + 1,
    person_id,
    network_id: DEMO_NETWORK_ID,
    message,
    sentiment_score,
    created_at: daysAgoTimestamp(ago, 20),
  }))

  // Weekly history recorded by the backend's scoring job (oldest -> newest).
  const burnoutHistory = { 2: [41, 48, 55, 63, 68], 3: [22, 20, 25, 24, 28], 4: [18, 20, 19, 22, 24], 5: [14, 12, 15, 13, 14] }
  let burnoutId = 1
  const burnoutScores = Object.entries(burnoutHistory).flatMap(([personId, scores]) =>
    scores.map((score, i) => ({
      id: burnoutId++,
      person_id: Number(personId),
      network_id: DEMO_NETWORK_ID,
      score,
      task_share: 0,
      missed_count: 0,
      sentiment_average: null,
      computed_at: daysAgoTimestamp((scores.length - i) * 7),
    })),
  )

  const accessGrants = [2, 3].map((grantee) => ({
    network_id: DEMO_NETWORK_ID,
    grantee_person_id: grantee,
    granted_by_person_id: 1,
    granted_at: daysAgoTimestamp(30),
  }))

  // NOT in the DB contract yet - a small patient profile for the overview header.
  const patientProfile = {
    person_id: 1,
    age: 74,
    location: 'Minneapolis, MN',
    headline: 'Recently discharged after a heart-failure hospitalization',
    discharged_on: daysFromToday(-4),
  }

  return {
    people,
    network,
    members: people.map((p) => p.id),
    relationships,
    tasks,
    availability,
    carePlans,
    aiPlanConflicts,
    checkins,
    burnoutScores,
    accessGrants,
    patientProfile,
  }
}

/** Demo role-switcher personas: one per dashboard view, plus the rest of the network. */
export const FEATURED_PERSONAS = [
  { personId: 1, view: 'Patient' },
  { personId: 2, view: 'Family caregiver' },
  { personId: 6, view: 'Doctor' },
  { personId: 9, view: 'Pharmacist' },
]
