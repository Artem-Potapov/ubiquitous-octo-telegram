// Visual vocabulary shared across the app: icons, labels and colours for task
// categories, gap kinds, severities and statuses.

import {
  Activity,
  AlertTriangle,
  CalendarDays,
  Car,
  CheckCircle2,
  CircleDashed,
  Clock,
  Copy,
  GitCompareArrows,
  Home,
  MessageCircle,
  Pill,
  Scale,
  Shapes,
  UserCheck,
  type LucideIcon,
} from 'lucide-react'
import type { GapSeverity, TaskCategory, TaskFrequency } from '../../api/contract'
import type { TaskDisplayStatus } from '../../domain/taskStatus'
import type { StrainLevelKey } from '../../domain/workload'
import type { DisplayGap } from '../../state/useGaps'

export type DisplayGapKind = DisplayGap['gap_kind']

// Chart colours follow a validated categorical order (adjacent pairs are
// colour-blind distinguishable). Never re-order or cycle them.
export const CATEGORY_META: Record<TaskCategory, { label: string; icon: LucideIcon; color: string }> = {
  medication: { label: 'Medication', icon: Pill, color: '#2a78d6' },
  appointment: { label: 'Appointment', icon: CalendarDays, color: '#eb6834' },
  monitoring: { label: 'Monitoring', icon: Activity, color: '#1baf7a' },
  transport: { label: 'Transport', icon: Car, color: '#eda100' },
  household: { label: 'Household', icon: Home, color: '#e87ba4' },
  communication: { label: 'Communication', icon: MessageCircle, color: '#008300' },
  other: { label: 'Other', icon: Shapes, color: '#6250d6' },
}

export const FREQUENCY_LABEL: Record<TaskFrequency, string> = {
  once: 'One-time',
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  as_needed: 'As needed',
}

export const GAP_KIND_META: Record<DisplayGapKind, { label: string; short: string; icon: LucideIcon; why: string; action: string }> = {
  unowned: {
    label: 'Unowned responsibility',
    short: 'Unowned',
    icon: CircleDashed,
    why: 'When a task has no owner, everyone tends to assume someone else has it. This is how refills lapse and appointments get missed.',
    action: 'Find an owner',
  },
  redundant: {
    label: 'Overlapping owners',
    short: 'Overlap',
    icon: Copy,
    why: 'This task should have one clear owner. With several, people duplicate effort, double-book, or give the care team conflicting information.',
    action: 'Choose one owner',
  },
  missed: {
    label: 'Missed responsibility',
    short: 'Missed',
    icon: Clock,
    why: 'A responsibility slipped past its deadline. After a hospital discharge, missed follow-ups are a common path back to readmission.',
    action: 'Recover the task',
  },
  plan_conflict: {
    label: 'Care plan conflict',
    short: 'Plan conflict',
    icon: GitCompareArrows,
    why: 'Two clinicians gave instructions that cannot both be followed. Caregivers should not have to resolve clinical disagreements themselves.',
    action: 'Request clinician review',
  },
  workload: {
    label: 'Workload imbalance',
    short: 'Workload',
    icon: Scale,
    why: 'One person carrying most of the care is fragile: if they get sick or burn out, many responsibilities fail at once.',
    action: 'Rebalance tasks',
  },
}

export const SEVERITY_META: Record<
  GapSeverity,
  { label: string; icon: LucideIcon; badge: string; bar: string; dot: string; text: string }
> = {
  high: { label: 'High', icon: AlertTriangle, badge: 'bg-rose-50 text-rose-700 ring-rose-200', bar: 'bg-rose-500', dot: '#f43f5e', text: 'text-rose-600' },
  medium: { label: 'Medium', icon: AlertTriangle, badge: 'bg-amber-50 text-amber-800 ring-amber-200', bar: 'bg-amber-400', dot: '#f59e0b', text: 'text-amber-600' },
  low: { label: 'Low', icon: AlertTriangle, badge: 'bg-sky-50 text-sky-700 ring-sky-200', bar: 'bg-sky-400', dot: '#38bdf8', text: 'text-sky-600' },
}

export const TASK_STATUS_META: Record<TaskDisplayStatus, { label: string; badge: string; icon: LucideIcon }> = {
  unassigned: { label: 'Unassigned', badge: 'bg-rose-50 text-rose-700 ring-rose-200', icon: CircleDashed },
  missed: { label: 'Missed', badge: 'bg-rose-50 text-rose-700 ring-rose-200', icon: Clock },
  overdue: { label: 'Overdue', badge: 'bg-rose-50 text-rose-700 ring-rose-200', icon: Clock },
  overlap: { label: 'Overlapping owners', badge: 'bg-amber-50 text-amber-800 ring-amber-200', icon: Copy },
  assigned: { label: 'Assigned', badge: 'bg-slate-100 text-slate-700 ring-slate-200', icon: UserCheck },
  done: { label: 'Completed', badge: 'bg-emerald-50 text-emerald-700 ring-emerald-200', icon: CheckCircle2 },
}

export const STRAIN_META: Record<StrainLevelKey, { badge: string; bar: string; text: string }> = {
  high: { badge: 'bg-rose-50 text-rose-700 ring-rose-200', bar: 'bg-rose-500', text: 'text-rose-600' },
  elevated: { badge: 'bg-amber-50 text-amber-800 ring-amber-200', bar: 'bg-amber-400', text: 'text-amber-600' },
  manageable: { badge: 'bg-emerald-50 text-emerald-700 ring-emerald-200', bar: 'bg-emerald-500', text: 'text-emerald-600' },
}
