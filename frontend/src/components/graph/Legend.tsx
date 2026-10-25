const swatch = 'inline-block h-3 w-3 shrink-0 rounded-sm'

export function Legend() {
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-700">
      <p className="mb-1.5 font-semibold text-slate-900">Legend</p>
      <ul className="space-y-1.5">
        <li className="flex items-center gap-2">
          <span className={`${swatch} rounded-full bg-navy-900`} /> Patient
        </li>
        <li className="flex items-center gap-2">
          <span className={`${swatch} border-l-4 border-navy-600 bg-white ring-1 ring-slate-200`} /> Professional
        </li>
        <li className="flex items-center gap-2">
          <span className={`${swatch} border-l-4 border-teal-600 bg-white ring-1 ring-slate-200`} /> Family
        </li>
        <li className="flex items-center gap-2">
          <span className="inline-block h-0.5 w-3 shrink-0 bg-slate-400" /> Care relationship
        </li>
        <li className="flex items-center gap-2">
          <span className="inline-block h-0.5 w-3 shrink-0 bg-danger-600" /> Coordination gap
        </li>
        <li className="flex items-center gap-2">
          <span className={`${swatch} border border-dashed border-danger-600 bg-danger-50`} /> Task with no owner
        </li>
        <li className="flex items-center gap-2">
          <span className={`${swatch} ring-2 ring-warn-600`} /> Burnout warning
        </li>
      </ul>
    </div>
  )
}
