import { AlertTriangle, LayoutDashboard, ListChecks, Orbit, Scale, ShieldCheck } from 'lucide-react'

export const NAV = [
  { page: 'overview', label: 'Overview', icon: LayoutDashboard, title: 'Overview', blurb: 'Everything about this care network at a glance' },
  { page: 'network', label: 'Care Network', icon: Orbit, title: 'Care Network', blurb: 'Who is involved, how they connect, and where the gaps are' },
  { page: 'tasks', label: 'Tasks', icon: ListChecks, title: 'Tasks & Responsibilities', blurb: 'Every responsibility, who owns it, and its status' },
  { page: 'gaps', label: 'Care Gaps', icon: AlertTriangle, title: 'Care Gap Detection', blurb: 'Coordination problems found automatically, and how to fix them' },
  { page: 'workload', label: 'Workload', icon: Scale, title: 'Caregiver Workload', blurb: 'How care is shared, and who might be stretched too thin' },
  { page: 'privacy', label: 'Privacy', icon: ShieldCheck, title: 'Privacy & Permissions', blurb: 'Patient-controlled access to sensitive health information' },
]
