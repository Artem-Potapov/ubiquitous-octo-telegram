import { useRef, useState } from 'react'
import { useCare } from '../../state/careContext'
import { CATEGORY_META } from '../ui/meta'

const fmt = (n) => Number(n.toFixed(1))

function Tooltip({ tip }) {
  if (!tip) return null
  return (
    <div
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-ink-900 px-3 py-2 text-xs text-white shadow-lg"
      style={{ left: tip.x, top: tip.y - 8 }}
    >
      {tip.content}
    </div>
  )
}

/** Horizontal stacked bars: weekly task occurrences per caregiver, by category. */
export function DistributionChart({ rows }) {
  const { data } = useCare()
  const ref = useRef(null)
  const [tip, setTip] = useState(null)
  const [showTable, setShowTable] = useState(false)
  const categories = Object.keys(CATEGORY_META).filter((c) => rows.some((r) => r.byCategory[c]))
  const max = Math.max(1, ...rows.map((r) => r.load))

  const show = (e, content) => {
    const box = ref.current.getBoundingClientRect()
    setTip({ x: e.clientX - box.left, y: e.clientY - box.top, content })
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1.5" aria-label="Legend">
        {categories.map((c) => (
          <span key={c} className="inline-flex items-center gap-1.5 text-xs text-slate-600">
            <span className="size-2.5 rounded-sm" style={{ background: CATEGORY_META[c].color }} />
            {CATEGORY_META[c].label}
          </span>
        ))}
      </div>

      <div ref={ref} className="relative space-y-3" onMouseLeave={() => setTip(null)}>
        {rows.map((r) => {
          const person = data.peopleById.get(r.person_id)
          return (
            <div key={r.person_id} className="flex items-center gap-3">
              <span className="w-24 shrink-0 truncate text-sm font-medium text-slate-700 sm:w-32">{person.full_name.split(' ')[0]}</span>
              <div className="flex h-7 flex-1 items-center">
                <div className="flex h-full gap-[2px] transition-all duration-700" style={{ width: `${(r.load / max) * 100}%` }}>
                  {categories
                    .filter((c) => r.byCategory[c])
                    .map((c, i, arr) => (
                      <div
                        key={c}
                        className={`h-full transition-opacity hover:opacity-80 ${i === 0 ? 'rounded-l' : ''} ${i === arr.length - 1 ? 'rounded-r' : ''}`}
                        style={{ flexGrow: r.byCategory[c], flexBasis: 0, background: CATEGORY_META[c].color, minWidth: 3 }}
                        onMouseMove={(e) =>
                          show(
                            e,
                            <>
                              <span className="font-semibold">{person.full_name.split(' ')[0]}</span> · {CATEGORY_META[c].label}
                              <br />
                              {fmt(r.byCategory[c])} task occurrences / week
                            </>,
                          )
                        }
                      />
                    ))}
                </div>
                <span className="ml-2 shrink-0 text-xs font-semibold tabular-nums text-slate-600">{fmt(r.load)}</span>
              </div>
            </div>
          )
        })}
        <Tooltip tip={tip} />
      </div>
      <p className="mt-3 text-xs text-slate-500">Weekly task occurrences: daily = 7, weekly = 1, monthly = 0.25. Shared tasks are split between owners.</p>

      <button type="button" onClick={() => setShowTable((s) => !s)} className="mt-3 text-xs font-medium text-brand-600 hover:underline">
        {showTable ? 'Hide table' : 'View as table'}
      </button>
      {showTable && (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-3 font-medium">Caregiver</th>
                {categories.map((c) => (
                  <th key={c} className="px-2 py-2 text-right font-medium">{CATEGORY_META[c].label}</th>
                ))}
                <th className="py-2 pl-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.person_id} className="border-b border-slate-100">
                  <td className="py-2 pr-3 font-medium text-slate-800">{data.peopleById.get(r.person_id).full_name}</td>
                  {categories.map((c) => (
                    <td key={c} className="px-2 py-2 text-right tabular-nums text-slate-600">{r.byCategory[c] ? fmt(r.byCategory[c]) : '—'}</td>
                  ))}
                  <td className="py-2 pl-2 text-right font-semibold tabular-nums text-slate-900">{fmt(r.load)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/** Small strain-history line with a hover tooltip per point. */
export function StrainSparkline({ history, current }) {
  const [hover, setHover] = useState(null)
  const points = [...history.slice(0, -1).map((h) => ({ score: h.score, at: h.computed_at })), { score: current, at: null }]
  const w = 160
  const h = 44
  const step = points.length > 1 ? w / (points.length - 1) : w
  const y = (s) => h - 4 - (s / 100) * (h - 8)
  const coords = points.map((p, i) => ({ ...p, x: i * step, y: y(p.score) }))
  const label = (p) => (p.at ? new Date(p.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'Now')

  return (
    <div className="relative">
      <svg viewBox={`-4 -4 ${w + 8} ${h + 8}`} className="h-12 w-full overflow-visible" role="img" aria-label={`Strain history: ${points.map((p) => p.score).join(', ')}`}>
        <line x1={0} x2={w} y1={y(60)} y2={y(60)} stroke="#fecdd3" strokeDasharray="3 3" />
        <polyline points={coords.map((c) => `${c.x},${c.y}`).join(' ')} fill="none" stroke="#475569" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {hover !== null && <line x1={coords[hover].x} x2={coords[hover].x} y1={0} y2={h} stroke="#cbd5e1" />}
        {coords.map((c, i) => (
          <g key={i}>
            <circle cx={c.x} cy={c.y} r={i === coords.length - 1 || hover === i ? 4 : 0} fill="#0c1229" stroke="#fff" strokeWidth={2} />
            <rect x={c.x - step / 2} y={-4} width={step} height={h + 8} fill="transparent" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
          </g>
        ))}
      </svg>
      {hover !== null && (
        <div
          className="pointer-events-none absolute -top-8 -translate-x-1/2 whitespace-nowrap rounded-md bg-ink-900 px-2 py-1 text-[11px] text-white"
          style={{ left: `${(coords[hover].x / w) * 100}%` }}
        >
          {label(coords[hover])}: <span className="font-semibold">{coords[hover].score}</span>
        </div>
      )}
    </div>
  )
}
