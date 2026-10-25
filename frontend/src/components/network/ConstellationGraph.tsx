// The care-network "constellation": a hand-built SVG graph.
//
// Layout tells the story: the patient sits at the centre, family and friends
// on the left, the clinical team on the right, and UNOWNED tasks float in the
// gap between them - literally falling through the cracks. Gap problems are
// drawn on top: overlap edges, plan-conflict edges, missed-task badges, and an
// amber halo around an overloaded caregiver.

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { Lock, Maximize2, Minus, Plus } from 'lucide-react'
import { initials, roleColor, firstName } from '../../domain/roles'
import { gapCountsByPerson } from '../../domain/gapView'
import type { Gap, Task } from '../../api/contract'
import type { Derived, GraphSelection, Snapshot } from '../../state/careContext'

interface Point {
  x: number
  y: number
}

type EdgeTone = 'default' | 'rose' | 'amber'

interface ProblemEdge {
  key: string
  a: number
  b: number
  tone: Exclude<EdgeTone, 'default'>
  label: string
  gap: Gap
  bow: number
}

const W = 1000
const H = 640
const CX = W / 2
const CY = H / 2
const RX = 340
const RY = 232
const NODE_R = 26
const PATIENT_R = 40

// Small deterministic pseudo-random generator so the starfield never jumps.
function stars(count: number) {
  let seed = 7
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  return Array.from({ length: count }, (_, i) => ({ id: i, x: rand() * W, y: rand() * H, r: rand() * 1.3 + 0.3, delay: rand() * 4 }))
}
const STARS = stars(90)

function arcPositions<T>(items: T[], fromDeg: number, toDeg: number): (Point & { item: T })[] {
  return items.map((item, i) => {
    const t = items.length === 1 ? 0.5 : i / (items.length - 1)
    const a = ((fromDeg + (toDeg - fromDeg) * t) * Math.PI) / 180
    return { item, x: CX + RX * Math.cos(a), y: CY - RY * Math.sin(a) }
  })
}

const ORPHAN_SLOTS: [number, number][] = [
  [0, -240],
  [0, 244],
  [-150, -232],
  [150, -232],
  [-150, 236],
  [150, 236],
]
// Compact mode crops the empty margins so the preview stays legible.
const COMPACT_VIEWBOX = '100 50 800 545'

function curve(a: Point, b: Point, bowFactor: number): { d: string; mid: Point } {
  if (!bowFactor) return { d: `M${a.x},${a.y} L${b.x},${b.y}`, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }
  const mx = (a.x + b.x) / 2
  const my = (a.y + b.y) / 2
  let nx = mx - CX
  let ny = my - CY
  const len = Math.hypot(nx, ny) || 1
  const dist = Math.hypot(b.x - a.x, b.y - a.y)
  nx /= len
  ny /= len
  const c = { x: mx + nx * dist * bowFactor, y: my + ny * dist * bowFactor }
  return {
    d: `M${a.x},${a.y} Q${c.x},${c.y} ${b.x},${b.y}`,
    mid: { x: 0.25 * a.x + 0.5 * c.x + 0.25 * b.x, y: 0.25 * a.y + 0.5 * c.y + 0.25 * b.y },
  }
}

function EdgeLabel({ x, y, text, tone = 'default', locked = false }: Point & { text: string; tone?: EdgeTone; locked?: boolean }) {
  const width = text.length * 6.1 + (locked ? 30 : 18)
  const fills: Record<EdgeTone, string> = { default: '#141c3a', rose: '#4c0519', amber: '#451a03' }
  const strokes: Record<EdgeTone, string> = { default: '#334155', rose: '#f43f5e', amber: '#f59e0b' }
  return (
    <g transform={`translate(${x},${y})`} pointerEvents="none">
      <rect x={-width / 2} y={-11} width={width} height={22} rx={11} fill={fills[tone]} stroke={strokes[tone]} strokeOpacity={0.7} />
      {locked && <Lock x={-width / 2 + 8} y={-6} width={12} height={12} color="#94a3b8" />}
      <text x={locked ? 7 : 0} y={4} textAnchor="middle" fontSize={11} fontWeight={500} fill="#e2e8f0">
        {text}
      </text>
    </g>
  )
}

interface ConstellationGraphProps {
  data: Snapshot
  derived: Derived
  selected?: GraphSelection
  onSelect?: (selection: GraphSelection) => void
  compact?: boolean
  showLabels?: boolean
}

export function ConstellationGraph({ data, derived, selected, onSelect, compact = false, showLabels = false }: ConstellationGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [view, setView] = useState({ k: 1, x: 0, y: 0 })
  const [hover, setHover] = useState<GraphSelection | null>(null)
  const drag = useRef<{ x: number; y: number; scale: number } | null>(null)

  const layout = useMemo(() => {
    const patient = data.patient
    const family = data.people.filter((p) => p.person_type === 'family')
    const pros = data.people.filter((p) => p.person_type === 'professional')
    const pos = new Map<number, Point>([[patient.id, { x: CX, y: CY }]])
    arcPositions(family, 128, 232).forEach(({ item, x, y }) => pos.set(item.id, { x, y }))
    arcPositions(pros, 52, -52).forEach(({ item, x, y }) => pos.set(item.id, { x, y }))

    const orphans = data.tasks
      .filter((t) => t.assignments.length === 0)
      .slice(0, ORPHAN_SLOTS.length)
      .map((task: Task, i) => ({ task, x: CX + ORPHAN_SLOTS[i][0], y: CY + ORPHAN_SLOTS[i][1] }))

    return { patient, pos, orphans }
  }, [data])

  const overloadedId = derived.imbalance?.overloaded.person_id
  const gapCounts = useMemo(() => gapCountsByPerson(data, derived.imbalance), [data, derived.imbalance])
  const missedIds = useMemo(
    () => new Set(data.tasks.flatMap((t) => t.assignments.filter((a) => a.status === 'missed').map((a) => a.person_id))),
    [data.tasks],
  )

  // Problem edges derived from open gaps. Overlaps curve inward and plan
  // conflicts outward so their labels clear the node names.
  const problemEdges = useMemo(() => {
    const out: ProblemEdge[] = []
    for (const gap of data.openGaps) {
      if (gap.gap_kind === 'redundant') {
        const owners = (gap.task_id ? data.tasksById.get(gap.task_id) : undefined)?.assignments.map((a) => a.person_id) ?? []
        for (let i = 1; i < owners.length; i++) out.push({ key: `r${gap.id}-${i}`, a: owners[0], b: owners[i], tone: 'rose', label: 'Overlap', gap, bow: -0.35 })
      }
      if (gap.gap_kind === 'plan_conflict') {
        const authors = [...new Set(data.carePlans.filter((p) => gap.related_care_plan_ids.includes(p.id)).map((p) => p.author_person_id))]
        if (authors.length >= 2) out.push({ key: `p${gap.id}`, a: authors[0], b: authors[1], tone: 'amber', label: 'Plan conflict', gap, bow: 0.9 })
      }
    }
    return out
  }, [data])

  const selectedPersonId = selected?.type === 'person' ? selected.id : null
  const focusId = hover?.type === 'person' ? hover.id : selectedPersonId
  // The patient touches almost every edge, so labelling all of them is noise.
  const labelFocusId = focusId === data.patient.id ? null : focusId

  // ----- zoom & pan (full mode only) ---------------------------------------
  useEffect(() => {
    const svg = svgRef.current
    if (compact || !svg) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const pt = svg.createSVGPoint()
      pt.x = e.clientX
      pt.y = e.clientY
      const ctm = svg.getScreenCTM()
      if (!ctm) return
      const p = pt.matrixTransform(ctm.inverse())
      setView((v) => {
        const k = Math.min(2.5, Math.max(0.6, v.k * (e.deltaY < 0 ? 1.12 : 1 / 1.12)))
        return { k, x: p.x - ((p.x - v.x) * k) / v.k, y: p.y - ((p.y - v.y) * k) / v.k }
      })
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [compact])

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    const ctm = svgRef.current?.getScreenCTM()
    if (compact || !ctm || (e.target as SVGElement).dataset.bg !== 'true') return
    drag.current = { x: e.clientX, y: e.clientY, scale: ctm.a }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (!drag.current) return
    const { x, y, scale } = drag.current
    drag.current = { ...drag.current, x: e.clientX, y: e.clientY }
    setView((v) => ({ ...v, x: v.x + (e.clientX - x) / scale, y: v.y + (e.clientY - y) / scale }))
  }
  const endDrag = () => {
    drag.current = null
  }

  const zoomBy = (factor: number) =>
    setView((v) => {
      const k = Math.min(2.5, Math.max(0.6, v.k * factor))
      return { k, x: CX - ((CX - v.x) * k) / v.k, y: CY - ((CY - v.y) * k) / v.k }
    })

  const select = (item: GraphSelection) => onSelect?.(item)
  const keySelect = (item: GraphSelection) => (e: KeyboardEvent<SVGGElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      select(item)
    }
  }

  const { patient, pos, orphans } = layout

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl bg-ink-950">
      <svg
        ref={svgRef}
        viewBox={compact ? COMPACT_VIEWBOX : `0 0 ${W} ${H}`}
        className={`h-full w-full select-none ${compact ? '' : 'cursor-grab active:cursor-grabbing'}`}
        role="img"
        aria-label={`Care network for ${patient.full_name}: ${data.people.length - 1} connected people and ${orphans.length} unowned tasks`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
      >
        <defs>
          <radialGradient id="cg-bg" cx="50%" cy="50%" r="65%">
            <stop offset="0%" stopColor="#1a2550" />
            <stop offset="60%" stopColor="#0c1229" />
            <stop offset="100%" stopColor="#070b1a" />
          </radialGradient>
          <radialGradient id="cg-gap-zone" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#f43f5e" stopOpacity="0" />
          </radialGradient>
          <filter id="cg-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect data-bg="true" width={W} height={H} fill="url(#cg-bg)" />
        {STARS.map((s) => (
          <circle
            key={s.id}
            cx={s.x}
            cy={s.y}
            r={s.r}
            fill="#c7d2fe"
            className={s.id % 3 === 0 ? 'animate-twinkle' : ''}
            style={{ animationDelay: `${s.delay}s`, opacity: 0.35 }}
            pointerEvents="none"
          />
        ))}

        <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
          {/* hemisphere captions */}
          {!compact && (
            <g pointerEvents="none" fontSize={11} fontWeight={600} letterSpacing={2} fill="#64748b">
              <text x={CX - RX - 10} y={CY - RY - 40} textAnchor="middle">FAMILY &amp; FRIENDS</text>
              <text x={CX + RX + 10} y={CY - RY - 40} textAnchor="middle">CLINICAL TEAM</text>
            </g>
          )}

          {/* the "cracks" between the two sides, where unowned tasks drift */}
          {orphans.length > 0 && (
            <>
              <ellipse cx={CX} cy={CY - 215} rx={190} ry={70} fill="url(#cg-gap-zone)" pointerEvents="none" />
              <ellipse cx={CX} cy={CY + 220} rx={190} ry={70} fill="url(#cg-gap-zone)" pointerEvents="none" />
            </>
          )}

          {/* relationship edges */}
          {data.edges.map((e) => {
            const a = pos.get(e.source_person_id)
            const b = pos.get(e.target_person_id)
            if (!a || !b) return null
            const touchesPatient = e.source_person_id === patient.id || e.target_person_id === patient.id
            const { d, mid } = curve(a, b, touchesPatient ? 0 : 0.28)
            const active = focusId && (e.source_person_id === focusId || e.target_person_id === focusId)
            const other = e.source_person_id === focusId ? e.target_person_id : e.source_person_id
            const color = active && focusId ? roleColor(data.peopleById.get(other === patient.id ? focusId : other)) : '#94a3b8'
            return (
              <g key={e.id}>
                <path
                  d={d}
                  fill="none"
                  stroke={color}
                  strokeWidth={active ? 2.5 : 1.4}
                  strokeOpacity={focusId && !active ? 0.12 : active ? 0.95 : 0.32}
                  strokeDasharray={e.is_redacted ? '4 5' : undefined}
                  className="transition-all duration-300"
                />
                {((active && labelFocusId) || (showLabels && !compact)) && (
                  <EdgeLabel x={mid.x} y={mid.y} text={e.label} locked={e.is_redacted} />
                )}
              </g>
            )
          })}

          {/* gap edges: overlaps and plan conflicts */}
          {problemEdges.map((pe) => {
            const a = pos.get(pe.a)
            const b = pos.get(pe.b)
            if (!a || !b) return null
            const { d, mid } = curve(a, b, pe.bow)
            const color = pe.tone === 'rose' ? '#f43f5e' : '#f59e0b'
            return (
              <g key={pe.key} className="cursor-pointer" onClick={() => select({ type: 'gap', id: pe.gap.id })}>
                <path d={d} fill="none" stroke={color} strokeWidth={8} strokeOpacity={0.12} />
                <path d={d} fill="none" stroke={color} strokeWidth={2} strokeDasharray="6 6" className="edge-flow" />
                {!compact && <EdgeLabel x={mid.x} y={mid.y} text={pe.label} tone={pe.tone} />}
              </g>
            )
          })}

          {/* unowned tasks drifting in the gap */}
          {orphans.map(({ task, x, y }) => {
            const isSel = selected?.type === 'task' && selected.id === task.id
            const isHover = hover?.type === 'task' && hover.id === task.id
            const label = task.is_redacted ? 'Restricted task' : task.title
            const max = x === CX ? 30 : 22
            const short = label.length > max ? `${label.slice(0, max - 2)}…` : label
            return (
              <g key={`t${task.id}`}>
                <line x1={x} y1={y} x2={CX} y2={CY} stroke="#f43f5e" strokeWidth={1.6} strokeDasharray="5 7" strokeOpacity={0.7} className="edge-flow" />
                <g
                  transform={`translate(${x},${y})`}
                  className="cursor-pointer outline-none"
                  role="button"
                  tabIndex={0}
                  aria-label={`Unowned task: ${label}`}
                  onClick={() => select({ type: 'task', id: task.id })}
                  onKeyDown={keySelect({ type: 'task', id: task.id })}
                  onMouseEnter={() => setHover({ type: 'task', id: task.id })}
                  onMouseLeave={() => setHover(null)}
                >
                  <circle r={24} fill="#f43f5e" opacity={0.35} className="svg-pulse animate-gap-pulse" />
                  <circle r={17} fill="#1c0a14" stroke="#f43f5e" strokeWidth={isSel || isHover ? 3 : 2} strokeDasharray="4 3" />
                  {task.is_redacted ? (
                    <Lock x={-7} y={-7} width={14} height={14} color="#fda4af" />
                  ) : (
                    <text y={5} textAnchor="middle" fontSize={15} fontWeight={700} fill="#fda4af">?</text>
                  )}
                  {!compact && (
                    <g pointerEvents="none">
                      <text y={y < CY ? -32 : 38} textAnchor="middle" fontSize={12} fontWeight={600} fill="#fecdd3">{short}</text>
                      <text y={y < CY ? -18 : 52} textAnchor="middle" fontSize={10} fill="#fb7185" letterSpacing={1}>NO OWNER</text>
                    </g>
                  )}
                </g>
              </g>
            )
          })}

          {/* people */}
          {data.people.map((person) => {
            const p = pos.get(person.id)
            if (!p) return null
            const isPatient = person.id === patient.id
            const r = isPatient ? PATIENT_R : NODE_R
            const color = roleColor(person)
            const isSel = selectedPersonId === person.id
            const dim = focusId && focusId !== person.id && !data.edges.some(
              (e) => (e.source_person_id === focusId && e.target_person_id === person.id) || (e.target_person_id === focusId && e.source_person_id === person.id),
            )
            const gaps = gapCounts.get(person.id) ?? 0
            const overloaded = person.id === overloadedId
            const status = overloaded ? 'Overloaded' : missedIds.has(person.id) ? 'Missed task' : null
            const labelBelow = !(person.person_type === 'patient')
            return (
              <g
                key={person.id}
                transform={`translate(${p.x},${p.y})`}
                className="cursor-pointer outline-none transition-opacity duration-300"
                opacity={dim ? 0.35 : 1}
                role="button"
                tabIndex={0}
                aria-label={`${person.full_name}, ${person.subrole}${gaps ? `, ${gaps} open gaps` : ''}`}
                onClick={() => select({ type: 'person', id: person.id })}
                onKeyDown={keySelect({ type: 'person', id: person.id })}
                onMouseEnter={() => setHover({ type: 'person', id: person.id })}
                onMouseLeave={() => setHover(null)}
              >
                {overloaded && (
                  <circle r={r + 16} fill="none" stroke="#f59e0b" strokeWidth={3} className="svg-pulse animate-gap-pulse" />
                )}
                <circle r={r + 8} fill={color} opacity={isPatient ? 0.25 : 0.14} filter="url(#cg-glow)" />
                {isSel && <circle r={r + 6} fill="none" stroke="#fff" strokeWidth={2.5} />}
                <circle r={r} fill={color} stroke="#0c1229" strokeWidth={2} />
                <circle r={r} fill="url(#cg-bg)" opacity={0.15} />
                <text y={isPatient ? 7 : 5} textAnchor="middle" fontSize={isPatient ? 20 : 14} fontWeight={700} fill="#fff" pointerEvents="none">
                  {initials(person.full_name)}
                </text>

                {gaps > 0 && (
                  <g transform={`translate(${r * 0.72},${-r * 0.72})`} pointerEvents="none">
                    <circle r={10} fill="#f43f5e" stroke="#0c1229" strokeWidth={2} />
                    <text y={4} textAnchor="middle" fontSize={11} fontWeight={700} fill="#fff">{gaps}</text>
                  </g>
                )}

                <g pointerEvents="none">
                  <text y={labelBelow ? r + 18 : r + 20} textAnchor="middle" fontSize={compact ? 15 : 13} fontWeight={600} fill="#f1f5f9">
                    {compact ? firstName(person) : person.full_name}
                  </text>
                  {!compact && (
                    <text y={r + 33} textAnchor="middle" fontSize={11} fill="#94a3b8">{person.subrole}</text>
                  )}
                  {!compact && status && (
                    <g transform={`translate(${(person.person_type === 'family' ? -1 : 1) * (r + 52)},0)`}>
                      <rect x={-38} y={-10} width={76} height={20} rx={10} fill={overloaded ? '#451a03' : '#4c0519'} stroke={overloaded ? '#f59e0b' : '#f43f5e'} strokeOpacity={0.5} />
                      <text y={4} textAnchor="middle" fontSize={10} fontWeight={600} fill={overloaded ? '#fcd34d' : '#fda4af'}>{status}</text>
                    </g>
                  )}
                </g>
              </g>
            )
          })}
        </g>
      </svg>

      {!compact && (
        <div className="absolute right-3 top-3 flex flex-col overflow-hidden rounded-xl bg-ink-800/90 ring-1 ring-white/10 backdrop-blur">
          <button type="button" onClick={() => zoomBy(1.2)} className="p-2 text-slate-300 hover:bg-white/10 hover:text-white" aria-label="Zoom in">
            <Plus className="size-4" />
          </button>
          <button type="button" onClick={() => zoomBy(1 / 1.2)} className="p-2 text-slate-300 hover:bg-white/10 hover:text-white" aria-label="Zoom out">
            <Minus className="size-4" />
          </button>
          <button type="button" onClick={() => setView({ k: 1, x: 0, y: 0 })} className="p-2 text-slate-300 hover:bg-white/10 hover:text-white" aria-label="Reset view">
            <Maximize2 className="size-4" />
          </button>
        </div>
      )}
    </div>
  )
}

export function ConstellationLegend({ dark = false }: { dark?: boolean }) {
  const text = dark ? 'text-slate-300' : 'text-slate-600'
  const roles = [
    ['#eda100', 'Patient'],
    ['#1baf7a', 'Family & friends'],
    ['#2a78d6', 'Physician'],
    ['#e87ba4', 'Nursing'],
    ['#6250d6', 'Pharmacy'],
  ]
  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-2 text-xs ${text}`}>
      {roles.map(([c, l]) => (
        <span key={l} className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ background: c }} />
          {l}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span className="size-3 rounded-full border-2 border-dashed border-rose-500" /> Unowned task
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-0 w-4 border-t-2 border-dashed border-rose-500" /> Overlapping owners
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-0 w-4 border-t-2 border-dashed border-amber-500" /> Plan conflict
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="size-3 rounded-full border-2 border-amber-400" /> Overloaded caregiver
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-flex size-3.5 items-center justify-center rounded-full bg-rose-500 text-[8px] font-bold text-white">1</span> Open gaps
      </span>
    </div>
  )
}
