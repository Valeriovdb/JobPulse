interface StatBarItem {
  label: string
  count: number
  color?: string
  drillKey?: string
}

export function StackedBar({
  items,
  total,
  alwaysShowLabels = false,
  onSegmentClick,
  activeKey,
}: {
  items: StatBarItem[]
  total?: number
  alwaysShowLabels?: boolean
  onSegmentClick?: (key: string, label: string) => void
  activeKey?: string | null
}) {
  if (!items.length) return null
  const sum = total ?? items.reduce((acc, i) => acc + i.count, 0)

  return (
    <div className="space-y-4">
      <div className="flex h-2.5 rounded-full overflow-hidden gap-px">
        {items.map((item) => {
          const pct = sum > 0 ? (item.count / sum) * 100 : 0
          if (pct === 0) return null
          const key = item.drillKey ?? item.label
          const isActive = activeKey === key
          return (
            <div
              key={item.label}
              title={`${item.label}: ${Math.round(pct)}%`}
              onClick={onSegmentClick ? () => onSegmentClick(key, item.label) : undefined}
              style={{
                width: `${pct}%`,
                backgroundColor: item.color ?? '#818cf8',
                opacity: activeKey && !isActive ? 0.4 : 1,
              }}
              className={onSegmentClick ? 'cursor-pointer transition-opacity' : ''}
            />
          )
        })}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {items.map((item) => {
          const pct = sum > 0 ? Math.round((item.count / sum) * 100) : 0
          if (pct === 0 && !alwaysShowLabels) return null
          const key = item.drillKey ?? item.label
          const isActive = activeKey === key
          return (
            <div
              key={item.label}
              onClick={onSegmentClick ? () => onSegmentClick(key, item.label) : undefined}
              className={[
                'flex items-center gap-2',
                onSegmentClick ? 'cursor-pointer' : '',
                activeKey && !isActive ? 'opacity-40' : '',
              ].join(' ')}
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: item.color ?? '#818cf8' }}
              />
              <span className="text-xs text-muted">{item.label}</span>
              <span className="text-xs text-white font-medium tabular-nums">{pct}%</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface StatBarProps {
  items: StatBarItem[]
  total?: number
  labelMap?: Record<string, string>
  showPct?: boolean
  barColor?: string
  onBarClick?: (key: string, label: string) => void
  activeKey?: string | null
}

const DEFAULT_LABEL_MAP: Record<string, string> = {
  // Language
  not_mentioned: 'No German required',
  plus: 'German is a plus',
  must: 'German required',
  // Seniority
  junior: 'Junior',
  mid: 'Mid',
  mid_senior: 'Mid / Senior',
  senior: 'Senior',
  lead: 'Lead',
  staff: 'Staff',
  group: 'Group',
  principal: 'Principal',
  head: 'Head / Director',
  // Work mode
  remote: 'Remote',
  hybrid: 'Hybrid',
  hybrid_1d: 'Hybrid · 1 day/week',
  hybrid_2d: 'Hybrid · 2 days/week',
  hybrid_3d: 'Hybrid · 3 days/week',
  hybrid_4d: 'Hybrid · 4 days/week',
  onsite: 'On-site',
  // PM type (current)
  core_pm: 'Core PM',
  technical: 'Technical PM',
  customer_facing: 'Customer-facing PM',
  platform: 'Platform PM',
  data_ai: 'Data / AI PM',
  growth: 'Growth PM',
  internal_ops: 'Internal Tools PM',
  // PM type (legacy — kept for backward compatibility with existing DB data)
  data: 'Data PM',
  other: 'Other',
  // Generic
  unknown: 'Unclassified',
  unclassified: 'Unclassified',
  // Sources
  en: 'English',
  de: 'German',
  jsearch: 'JSearch',
  arbeitnow: 'Arbeitnow',
}

export function StatBar({ items, total, labelMap, showPct = true, barColor, onBarClick, activeKey }: StatBarProps) {
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
        const key = item.drillKey ?? item.label
        const isActive = activeKey === key

        return (
          <div
            key={item.label}
            onClick={onBarClick ? () => onBarClick(key, label) : undefined}
            className={[
              'flex items-center gap-3 rounded-lg transition-colors',
              onBarClick ? 'cursor-pointer hover:bg-surface-elevated px-2 -mx-2 py-0.5' : '',
              activeKey && !isActive ? 'opacity-40' : '',
              isActive ? 'bg-surface-elevated' : '',
            ].join(' ')}
          >
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
            {showPct ? (
              <span className="text-xs text-right shrink-0 tabular-nums w-20">
                <span className="text-white font-medium">{item.count}</span>
                <span className="text-muted"> · {pct}%</span>
              </span>
            ) : (
              <span className="text-sm text-white font-medium w-8 text-right shrink-0 tabular-nums">
                {item.count}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
