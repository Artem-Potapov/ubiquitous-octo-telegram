import type { NewCarePlan } from '../types/api'

// Demo fixtures for the Care Plans tab ("Use sample plans"). Fictional text.
// Author ids match the seeded network: 6 = cardiologist, 7 = primary care physician.
export const SAMPLE_PLANS: NewCarePlan[] = [
  {
    title: 'Heart failure management plan',
    author_person_id: 6,
    raw_text:
      'Furosemide 40 mg each morning. Fluid restriction: no more than 1.5 L per day. Weigh daily before breakfast; call the clinic for a gain of more than 2 lb in a day or 5 lb in a week. Sodium under 2 g per day.',
  },
  {
    title: 'Type 2 diabetes management plan',
    author_person_id: 7,
    raw_text:
      'Metformin 1000 mg twice daily with meals. Fasting blood glucose each morning. Encourage 2–2.5 L of fluid intake daily to prevent dehydration. A1C recheck in one week.',
  },
]
