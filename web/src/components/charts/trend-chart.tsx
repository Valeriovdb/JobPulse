'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { TimeseriesPoint } from '@/types/data'

interface TrendChartProps {
  data: TimeseriesPoint[]
  color?: string
  showRollingAvg?: boolean
}

function rollingAverage(data: TimeseriesPoint[], window: number): (number | null)[] {
  return data.map((_, i) => {
    if (i < window - 1) return null
    const slice = data.slice(i - window + 1, i + 1)
    const sum = slice.reduce((acc, d) => acc + d.count, 0)
    return Math.round((sum / window) * 10) / 10
  })
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
      {payload.map((entry: any) => (
        <p key={entry.dataKey} style={{ color: entry.color }} className="font-medium">
          {entry.name}: {entry.value ?? '—'}
        </p>
      ))}
    </div>
  )
}

export function TrendChart({ data, color = '#818cf8', showRollingAvg = false }: TrendChartProps) {
  const avgValues = showRollingAvg ? rollingAverage(data, 7) : []

  const chartData = data.map((d, i) => ({
    date: formatDate(d.date),
    count: d.count,
    avg: avgValues[i] ?? undefined,
  }))

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
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
        <Line
          type="monotone"
          dataKey="count"
          name="Roles"
          stroke={color}
          strokeWidth={1.5}
          dot={false}
          activeDot={{ r: 3, fill: color }}
        />
        {showRollingAvg && (
          <Line
            type="monotone"
            dataKey="avg"
            name="7-day avg"
            stroke="#fb923c"
            strokeWidth={1.5}
            strokeDasharray="4 2"
            dot={false}
            connectNulls={false}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  )
}
