export function Card({ className = '', children, ...props }) {
  return (
    <section className={`rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${className}`} {...props}>
      {children}
    </section>
  )
}

export function CardHeader({ title, subtitle, icon: Icon, action, className = '' }) {
  return (
    <header className={`flex items-start justify-between gap-4 px-5 pt-5 ${className}`}>
      <div className="flex min-w-0 items-start gap-3">
        {Icon && (
          <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
            <Icon className="size-4" aria-hidden />
          </span>
        )}
        <div className="min-w-0">
          <h2 className="font-display text-[15px] font-bold text-slate-900">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  )
}

export function StatTile({ label, value, sublabel, icon: Icon, tone = 'slate', onClick }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-600',
    brand: 'bg-brand-50 text-brand-600',
    rose: 'bg-rose-50 text-rose-600',
    amber: 'bg-amber-50 text-amber-600',
    emerald: 'bg-emerald-50 text-emerald-600',
  }
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      onClick={onClick}
      className={`flex w-full items-start gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition ${onClick ? 'hover:-translate-y-0.5 hover:shadow-md' : ''}`}
    >
      <span className={`inline-flex size-10 shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}>
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>
        <span className="block font-display text-2xl font-bold text-slate-900 tabular-nums">{value}</span>
        {sublabel && <span className="block truncate text-xs text-slate-500">{sublabel}</span>}
      </span>
    </Tag>
  )
}

export function EmptyState({ icon: Icon, title, children }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
      {Icon && (
        <span className="mb-3 inline-flex size-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
          <Icon className="size-6" aria-hidden />
        </span>
      )}
      <p className="font-display font-bold text-slate-900">{title}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-slate-500">{children}</div>}
    </div>
  )
}
