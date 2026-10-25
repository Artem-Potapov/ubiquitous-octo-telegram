import { useConstellation, type DrawerTab } from '../../store/useConstellation'
import { ActivityLog } from '../drawer/ActivityLog'
import { CarePlansTab } from '../drawer/CarePlansTab'
import { GapsTab } from '../drawer/GapsTab'
import { PrivacyTab } from '../drawer/PrivacyTab'
import { TasksTab } from '../drawer/TasksTab'

const TABS: { id: DrawerTab; label: string }[] = [
  { id: 'gaps', label: 'Gaps' },
  { id: 'tasks', label: 'My Tasks' },
  { id: 'plans', label: 'Care Plans' },
  { id: 'privacy', label: 'Privacy' },
]

const PANELS: Record<DrawerTab, () => React.JSX.Element> = {
  gaps: GapsTab,
  tasks: TasksTab,
  plans: CarePlansTab,
  privacy: PrivacyTab,
}

export function ActionDrawer() {
  const tab = useConstellation((s) => s.drawerTab)
  const setTab = useConstellation((s) => s.setDrawerTab)
  const role = useConstellation((s) => s.role)
  const gapCount = useConstellation((s) => s.gaps.length)

  // Only the patient decides who sees restricted information.
  const tabs = TABS.filter((t) => t.id !== 'privacy' || role === 'Patient')
  const Panel = PANELS[tab]

  return (
    <aside className="flex w-[380px] shrink-0 flex-col border-l border-slate-200 bg-white" aria-label="Actions">
      <div role="tablist" aria-label="Action drawer" className="flex shrink-0 border-b border-slate-200 px-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            id={`tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            aria-controls="drawer-panel"
            onClick={() => setTab(t.id)}
            className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-3 text-sm font-medium ${
              tab === t.id ? 'border-navy-900 text-navy-900' : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            {t.label}
            {t.id === 'gaps' && gapCount > 0 && (
              <span className="rounded-full bg-danger-50 px-1.5 text-[11px] font-semibold text-danger-700">{gapCount}</span>
            )}
          </button>
        ))}
      </div>

      <div id="drawer-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="flex-1 overflow-y-auto p-4">
        <Panel />
      </div>

      <ActivityLog />
    </aside>
  )
}
