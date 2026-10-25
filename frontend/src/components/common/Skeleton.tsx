/** Placeholder block shown while data loads, so no view is ever blank. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded bg-slate-200 ${className}`} />
}

export function CardSkeletons({ count = 3 }: { count?: number }) {
  return (
    <div role="status" aria-label="Loading" className="space-y-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="space-y-2 rounded-lg border border-slate-200 p-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-8 w-full" />
        </div>
      ))}
    </div>
  )
}
