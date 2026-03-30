interface KpiCardProps {
  value: string | number
  label: string
  sub?: string
  accent?: boolean
}

export function KpiCard({ value, label, sub, accent }: KpiCardProps) {
  return (
    <div className="bg-surface border border-border rounded-xl p-5 flex flex-col gap-1">
      <span
        className={[
          'text-3xl font-bold tracking-tight leading-none',
          accent ? 'text-accent' : 'text-white',
        ].join(' ')}
      >
        {value}
      </span>
      <span className="text-sm text-muted mt-1">{label}</span>
      {sub && <span className="text-2xs text-subtle mt-0.5">{sub}</span>}
    </div>
  )
}

export function KpiGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {children}
    </div>
  )
}
