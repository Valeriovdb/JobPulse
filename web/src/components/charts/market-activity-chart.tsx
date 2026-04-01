'use client'

import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from 'recharts'

interface MarketActivityData {
  date: string
  active_jobs: number
  jobs_added: number
  jobs_removed: number
  net_change: number
}

interface MarketActivityChartProps {
  data: MarketActivityData[]
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z')
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  
  // Find data from payload
  const activeJobs = payload.find((p: any) => p.dataKey === 'active_jobs')?.value
  const added = payload.find((p: any) => p.dataKey === 'jobs_added')?.value
  // removed is stored as positive in the payload for drawing, but let's show it as negative or handle it
  const removedRaw = payload.find((p: any) => p.dataKey === 'jobs_removed_neg')?.value
  const removed = Math.abs(removedRaw || 0)
  const net = (added || 0) - removed

  return (
    <div className="bg-surface-elevated border border-border-strong rounded-lg px-3 py-2 text-sm shadow-xl min-w-[140px]">
      <p className="text-muted text-xs mb-2 font-medium">{label}</p>
      
      <div className="space-y-1.5">
        <div className="flex justify-between gap-4">
          <span className="text-white font-medium">Active roles</span>
          <span className="text-white tabular-nums font-bold">{activeJobs ?? 0}</span>
        </div>
        
        <div className="h-px bg-border/50 my-1" />
        
        <div className="flex justify-between gap-4">
          <span className="text-[#4ade80]">Added</span>
          <span className="text-[#4ade80] tabular-nums">+{added ?? 0}</span>
        </div>
        
        <div className="flex justify-between gap-4">
          <span className="text-[#f87171]">Removed</span>
          <span className="text-[#f87171] tabular-nums">-{removed}</span>
        </div>
        
        <div className="flex justify-between gap-4 pt-0.5 border-t border-border/30">
          <span className="text-muted text-xs">Net change</span>
          <span className={`text-xs tabular-nums ${net >= 0 ? 'text-[#4ade80]' : 'text-[#f87171]'}`}>
            {net >= 0 ? '+' : ''}{net}
          </span>
        </div>
      </div>
    </div>
  )
}

export function MarketActivityChart({ data }: MarketActivityChartProps) {
  const chartData = data.map((d) => ({
    ...d,
    formattedDate: formatDate(d.date),
    // Recharts handles negative bars fine, but we need removed to be negative
    jobs_removed_neg: -Math.abs(d.jobs_removed),
  }))

  // Calculate Y-axis domain for bars to ensure they don't overpower the line
  const maxActive = Math.max(...data.map(d => d.active_jobs), 10)
  const maxAdded = Math.max(...data.map(d => d.jobs_added), 5)
  const maxRemoved = Math.max(...data.map(d => d.jobs_removed), 5)
  const maxChurn = Math.max(maxAdded, maxRemoved)
  
  // We want the churn bars to take up at most ~30-40% of the height
  // So we set the Y axis domain to be larger if needed, or just let Recharts handle it.
  // Actually, ComposedChart uses the same YAxis for both by default.
  // To keep bars secondary, we'll use a secondary YAxis or just keep them thin and subtle.

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="0" stroke="#262626" />
        <XAxis
          dataKey="formattedDate"
          tick={{ fontSize: 11, fill: '#737373' }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
          minTickGap={30}
        />
        <YAxis
          tick={{ fontSize: 11, fill: '#737373' }}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: '#ffffff', opacity: 0.05 }} />
        
        <ReferenceLine y={0} stroke="#525252" strokeWidth={1} />
        
        <Bar 
          dataKey="jobs_added" 
          name="Added" 
          fill="#4ade80" 
          fillOpacity={0.4}
          radius={[2, 2, 0, 0]}
          barSize={12}
        />
        <Bar 
          dataKey="jobs_removed_neg" 
          name="Removed" 
          fill="#f87171" 
          fillOpacity={0.4}
          radius={[0, 0, 2, 2]}
          barSize={12}
        />
        
        <Line
          type="monotone"
          dataKey="active_jobs"
          name="Active roles"
          stroke="#818cf8"
          strokeWidth={2.5}
          dot={false}
          activeDot={{ r: 4, fill: '#818cf8', stroke: '#fff', strokeWidth: 2 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
