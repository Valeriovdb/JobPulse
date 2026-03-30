interface StatBarItem {
  label: string
  count: number
  color?: string
}

interface StatBarProps {
  items: StatBarItem[]
  total?: number
  labelMap?: Record<string, string>
  showPct?: boolean
  barColor?: string
}

const DEFAULT_LABEL_MAP: Record<string, string> = {
  not_mentioned: 'No German required',
  plus: 'German is a plus',
  must: 'German required',
  junior: 'Junior',
  mid: 'Mid-level',
  senior: 'Senior',
  lead: 'Lead',
  staff: 'Staff',
  principal: 'Principal',
  head: 'Head / Director',
  unknown: 'Unclassified',
  hybrid: 'Hybrid',
  remote: 'Remote',
  onsite: 'On-site',
  core_pm: 'Core PM',
  technical: 'Technical PM',
  growth: 'Growth PM',
  data: 'Data PM',
  other: 'Other',
  en: 'English',
  de: 'German',
  jsearch: 'JSearch',
  arbeitnow: 'Arbeitnow',
}

export function StatBar({ items, total, labelMap, showPct = true, barColor }: StatBarProps) {
  if (!items.length) return null

  const labels = { ...DEFAULT_LABEL_MAP, ...labelMap }
  const max = Math.max(...items.map((i) => i.count))
  const sum = total ?? items.reduce((acc, i) => acc + i.count, 0)

  return (
    <div className="space-y-2.5">
      {items.map((item) => {
        const pct = sum > 0 ? Math.round((item.count / sum) * 100) : 0
        const barWidth = max > 0 ? (item.count / max) * 100 : 0
        const label = labels[item.label] ?? item.label

        return (
          <div key={item.label} className="flex items-center gap-3">
            <span className="text-sm text-muted w-40 shrink-0 truncate">{label}</span>
            <div className="flex-1 h-1.5 bg-surface-elevated rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${barWidth}%`,
                  backgroundColor: item.color ?? barColor ?? '#818cf8',
                }}
              />
            </div>
            <span className="text-sm text-white font-medium w-8 text-right shrink-0">
              {item.count}
            </span>
            {showPct && (
              <span className="text-2xs text-muted w-8 text-right shrink-0">
                {pct}%
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
