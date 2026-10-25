// DEMO FEATURE - lets judges experience each role's view. This is not
// authentication: in production the viewer comes from a signed-in session.

import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, RotateCcw } from 'lucide-react'
import { useCare } from '../../state/careContext'
import { Avatar } from '../ui/Avatar'
import { FEATURED_PERSONAS } from '../../data/demoScenario'

export function RoleSwitcher() {
  const { data, viewerId, setViewerId, actions, busy } = useCare()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e) => !ref.current?.contains(e.target) && setOpen(false)
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!data) return null
  const viewer = data.peopleById.get(viewerId) ?? data.viewer
  const featuredIds = new Set(FEATURED_PERSONAS.map((f) => f.personId))
  const others = data.people.filter((p) => !featuredIds.has(p.id))

  const choose = (id) => {
    setViewerId(id)
    setOpen(false)
  }

  const renderRow = (person, tag) => (
    <button
      key={person.id}
      type="button"
      onClick={() => choose(person.id)}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-slate-50 ${person.id === viewerId ? 'bg-brand-50/70' : ''}`}
    >
      <Avatar person={person} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-slate-900">{person.full_name}</span>
        <span className="block truncate text-xs text-slate-500">{tag ?? person.subrole}</span>
      </span>
      {person.id === viewerId && <Check className="size-4 text-brand-600" />}
    </button>
  )

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2.5 rounded-xl bg-white py-1.5 pl-1.5 pr-3 ring-1 ring-slate-200 transition hover:ring-slate-300"
      >
        <Avatar person={viewer} size="sm" />
        <span className="hidden text-left sm:block">
          <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Viewing as
            <span className="rounded bg-amber-100 px-1 py-px text-[9px] text-amber-800">Demo</span>
          </span>
          <span className="block max-w-40 truncate text-sm font-semibold text-slate-900">{viewer.full_name}</span>
        </span>
        <ChevronDown className="size-4 text-slate-400" />
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-80 overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200 animate-fade-in" role="menu">
          <div className="border-b border-amber-100 bg-amber-50 px-4 py-3">
            <p className="text-xs font-semibold text-amber-900">Demo role switcher</p>
            <p className="mt-0.5 text-xs text-amber-800/80">
              See the app as each person sees it. This isn't real sign-in, and every person here is fictional.
            </p>
          </div>
          <div className="max-h-[60vh] overflow-y-auto p-2">
            <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Featured perspectives</p>
            {FEATURED_PERSONAS.map((f) => {
              const person = data.peopleById.get(f.personId)
              return person ? renderRow(person, `${f.view} view · ${person.subrole}`) : null
            })}
            <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Everyone else in the network</p>
            {others.map((p) => renderRow(p))}
          </div>
          <div className="border-t border-slate-100 p-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                actions.resetDemo()
                setOpen(false)
              }}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
            >
              <RotateCcw className="size-4" /> Reset demo data
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
