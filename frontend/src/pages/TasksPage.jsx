import { useMemo, useState } from 'react'
import { Search, SearchX } from 'lucide-react'
import { useCare } from '../state/careContext'
import { Card, EmptyState } from '../components/ui/Card'
import { TaskRow } from '../components/tasks/TaskRow'
import { TaskDrawer } from '../components/tasks/TaskDrawer'
import { CATEGORY_META } from '../components/ui/meta'
import { isProblem, taskStatus } from '../domain/taskStatus'

const FILTERS = [
  { key: 'all', label: 'All', test: () => true },
  { key: 'attention', label: 'Needs attention', test: (t) => isProblem(t) },
  { key: 'unassigned', label: 'Unassigned', test: (t) => taskStatus(t) === 'unassigned' },
  { key: 'late', label: 'Missed / overdue', test: (t) => ['missed', 'overdue'].includes(taskStatus(t)) },
  { key: 'overlap', label: 'Overlapping', test: (t) => taskStatus(t) === 'overlap' },
  { key: 'assigned', label: 'Assigned', test: (t) => taskStatus(t) === 'assigned' },
  { key: 'done', label: 'Completed', test: (t) => taskStatus(t) === 'done' },
]

export function TasksPage() {
  const { data } = useCare()
  const [filter, setFilter] = useState('attention')
  const [category, setCategory] = useState('all')
  const [query, setQuery] = useState('')
  const [mineOnly, setMineOnly] = useState(false)
  const [openTaskId, setOpenTaskId] = useState(null)

  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.key, data.tasks.filter(f.test).length])), [data.tasks])

  // Search runs over what the data layer returned, so redacted titles can't be matched.
  const visible = useMemo(() => {
    const f = FILTERS.find((x) => x.key === filter)
    const q = query.trim().toLowerCase()
    return data.tasks.filter(
      (t) =>
        f.test(t) &&
        (category === 'all' || t.category === category) &&
        (!mineOnly || t.assignments.some((a) => a.person_id === data.viewer.id)) &&
        (!q || t.title.toLowerCase().includes(q)),
    )
  }, [data, filter, category, query, mineOnly])

  return (
    <div className="space-y-5">
      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Filter tasks by status">
        {FILTERS.map((f) => {
          const active = filter === f.key
          const alert = ['attention', 'unassigned', 'late', 'overlap'].includes(f.key) && counts[f.key] > 0
          return (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(f.key)}
              className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition ${
                active ? 'bg-ink-900 text-white shadow-sm' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-slate-300'
              }`}
            >
              {f.label}
              <span
                className={`rounded-full px-1.5 text-[11px] font-bold tabular-nums ${
                  active ? 'bg-white/15 text-white' : alert ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {counts[f.key]}
              </span>
            </button>
          )
        })}
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center">
          <label className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search responsibilities…"
              className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-9 pr-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-500/10"
            />
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700"
            aria-label="Filter by category"
          >
            <option value="all">All categories</option>
            {Object.entries(CATEGORY_META).map(([k, m]) => (
              <option key={k} value={k}>
                {m.label}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} className="size-4 accent-brand-600" />
            Only mine
          </label>
        </div>

        <div className="hidden items-center gap-4 border-b border-slate-100 bg-slate-50/60 px-5 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 sm:flex">
          <span className="w-10" />
          <span className="flex-1">Responsibility</span>
          <span className="hidden w-20 md:block" title="Derived from due date and status">Urgency</span>
          <span className="w-28 text-right">Owners</span>
          <span className="w-40 text-right">Status</span>
          <span className="w-4" />
        </div>

        {visible.length === 0 ? (
          <EmptyState icon={SearchX} title="No matching responsibilities">
            Try another filter or search term.
          </EmptyState>
        ) : (
          <div className="divide-y divide-slate-100">
            {visible.map((t) => (
              <TaskRow key={t.id} task={t} onOpen={() => setOpenTaskId(t.id)} />
            ))}
          </div>
        )}
      </Card>

      <p className="text-xs text-slate-500">
        Urgency is derived from due date and status. The data contract has no priority field yet.
      </p>

      {openTaskId && <TaskDrawer taskId={openTaskId} onClose={() => setOpenTaskId(null)} />}
    </div>
  )
}
