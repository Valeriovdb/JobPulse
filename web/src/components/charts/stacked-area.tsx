'use client'

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'

interface StackedAreaProps {
  dates: string[]
  series: Record<string, number[]>
  labelMap?: Record<string, string>
  colors?: Record<string, string>
}

const SENIORITY_COLORS: Record<string, string> = {
  junior: '#4ade80',
  mid: '#60a5fa',
  senior: '#818cf8',
  lead: '#a78bfa',
  staff: '#c084fc',
  principal: '#e879f9',
  head: '#f472b6',
  unknown: '#404040',
}

const GERMAN_REQ_COLORS: Record<string, string> = {
  not_mentioned: '#4ade80',
  plus: '#60a5fa',
  must: '#f87171',
}

const DEFAULT_LABEL_MAP: Record<string, string> = {
  not_mentioned: 'No German',
  plus: 'German bonus',
  must: 'German required',
  unknown: 'Unclassified',
  junior: 'Junior',
  mid: 'Mid',
  senior: 'Senior',
  lead: 'Lead',
  staff: 'Staff',
  principal: 'Principal',
  head: 'Head',
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z')
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-surface-elevated border border-border-strong rounded-lg px-3 py-2 text-sm shadow-xl">
      <p className="text-muted text-xs mb-1">{label}</p>
      {[...payload].reverse().map((entry: any) => (
        <p key={entry.dataKey} style={{ color: entry.color }} className="font-medium">
          {entry.name}: {entry.value}
        </p>
      ))}
    </div>
  )
}

export function StackedArea({ dates, series, labelMap, colors }: StackedAreaProps) {
  const labels = { ...DEFAULT_LABEL_MAP, ...labelMap }
  const allColors = { ...SENIORITY_COLORS, ...GERMAN_REQ_COLORS, ...colors }
  const keys = Object.keys(series).filter((k) => k !== 'unknown')
  if (series.unknown) keys.push('unknown')

  const chartData = dates.map((date, i) => {
    const point: Record<string, string | number> = { date: formatDate(date) }
    keys.forEach((k) => { point[k] = series[k]?.[i] ?? 0 })
    return point
  })

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="0" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: '#737373' }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 11, fill: '#737373' }}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          formatter={(value) => (
            <span style={{ color: '#a1a1aa', fontSize: 11 }}>{labels[value] ?? value}</span>
          )}
          iconSize={8}
          wrapperStyle={{ paddingTop: 8 }}
        />
        {keys.map((key) => (
          <Area
            key={key}
            type="monotone"
            dataKey={key}
            name={labels[key] ?? key}
            stackId="1"
            stroke={allColors[key] ?? '#818cf8'}
            fill={allColors[key] ?? '#818cf8'}
            fillOpacity={0.5}
            strokeWidth={1}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  )
}
