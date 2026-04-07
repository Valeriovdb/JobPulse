'use client'

import { useState, useMemo } from 'react'
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis,
  Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import type { Distributions, Job } from '@/types/data'
import { StatBar } from '@/components/stat-bar'
import { EmptyState } from '@/components/section'
import { DrillDownPanel, type DrillTarget } from '@/components/drill-down-panel'
import { DEFAULT_FILTERS } from '@/components/filter-bar'

// ─── Filter state ─────────────────────────────────────────────────────────────

type TimeWindow = '30d' | '60d' | '90d' | '180d'

interface BreakdownFilterState {
  timeWindow: TimeWindow
  seniority: 'all' | 'junior' | 'mid' | 'senior' | 'lead'
  roleFamily: string // pm_type value or 'all'
  language: 'all' | 'en' | 'de'
  germanReq: 'all' | 'not_mentioned' | 'plus' | 'must'
  workMode: 'all' | 'remote' | 'hybrid' | 'onsite'
}

const DEFAULT_BREAKDOWN_FILTERS: BreakdownFilterState = {
  timeWindow: '90d',
  seniority: 'all',
  roleFamily: 'all',
  language: 'all',
  germanReq: 'all',
  workMode: 'all',
}

function hasActiveFilter(f: BreakdownFilterState): boolean {
  return (
    f.timeWindow !== '90d' ||
    f.seniority !== 'all' ||
    f.roleFamily !== 'all' ||
    f.language !== 'all' ||
    f.germanReq !== 'all' ||
    f.workMode !== 'all'
  )
}

const TIME_WINDOW_DAYS: Record<TimeWindow, number> = { '30d': 30, '60d': 60, '90d': 90, '180d': 180 }
const TIME_WINDOW_LABEL: Record<TimeWindow, string> = {
  '30d': '30 days',
  '60d': '60 days',
  '90d': '90 days',
  '180d': '180 days',
}

// ─── Label / order maps ───────────────────────────────────────────────────────

const SENIORITY_ORDER = ['junior', 'mid', 'mid_senior', 'senior', 'lead', 'staff', 'group', 'principal']
const SENIORITY_LABELS: Record<string, string> = {
  junior:     'Junior',
  mid:        'Mid',
  mid_senior: 'Mid–Senior',
  senior:     'Senior',
  lead:       'Lead',
  staff:      'Staff',
  group:      'Group PM',
  principal:  'Principal',
}
const SENIORITY_COLORS: Record<string, string> = {
  junior:     '#4ade80',
  mid:        '#60a5fa',
  mid_senior: '#38bdf8',
  senior:     '#818cf8',
  lead:       '#a78bfa',
  staff:      '#c084fc',
  group:      '#e879f9',
  principal:  '#f472b6',
}

const INDUSTRY_LABELS: Record<string, string> = {
  saas_b2b_software:          'SaaS / B2B',
  fintech_payments:           'Fintech',
  ecommerce_marketplace:      'E-commerce',
  consumer_apps:              'Consumer apps',
  healthtech_biotech:         'Healthtech',
  mobility_automotive:        'Mobility',
  logistics_supply_chain:     'Logistics',
  media_entertainment:        'Media',
  cybersecurity:              'Cybersecurity',
  hrtech_future_of_work:      'HR tech',
  proptech_construction:      'Proptech',
  other:                      'Other',
  fintech:                    'Fintech',
  payments:                   'Payments',
  banking_financial_services: 'Banking / Financial',
  ai_ml_data_products:        'AI / ML / Data',
  consumer_digital_products:  'Consumer Digital',
  enterprise_internal_tools:  'Enterprise / Internal',
  healthtech:                 'Healthtech',
}

const DOMAIN_LABELS: Record<string, string> = {
  payments:                   'Payments',
  banking_financial_services: 'Banking / Financial',
  fintech:                    'Fintech',
  ecommerce_marketplace:      'E-commerce',
  saas_b2b_software:          'SaaS / B2B',
  mobility_automotive:        'Mobility / Automotive',
  logistics_supply_chain:     'Logistics',
  ai_ml_data_products:        'AI / ML / Data',
  consumer_digital_products:  'Consumer Digital',
  enterprise_internal_tools:  'Enterprise / Internal Tools',
  cybersecurity:              'Cybersecurity',
  healthtech:                 'Healthtech',
}

const WORK_MODE_ORDER = ['remote', 'hybrid_1d', 'hybrid_2d', 'hybrid_3d', 'hybrid_4d', 'hybrid', 'onsite', 'unknown']
const WORK_MODE_LABELS: Record<string, string> = {
  remote:    'Fully remote',
  hybrid_1d: 'Hybrid · 1 day/week',
  hybrid_2d: 'Hybrid · 2 days/week',
  hybrid_3d: 'Hybrid · 3 days/week',
  hybrid_4d: 'Hybrid · 4 days/week',
  hybrid:    'Hybrid (flexible)',
  onsite:    'On-site',
  unknown:   'Not specified',
}
const WORK_MODE_COLORS: Record<string, string> = {
  remote:    '#22d3ee',
  hybrid_1d: '#60a5fa',
  hybrid_2d: '#818cf8',
  hybrid_3d: '#a78bfa',
  hybrid_4d: '#c084fc',
  hybrid:    '#737373',
  onsite:    '#fb923c',
  unknown:   '#3a3a3a',
}
const HYBRID_RAW_KEYS = new Set(['hybrid_1d', 'hybrid_2d', 'hybrid_3d', 'hybrid_4d'])

const TRISTATE_ORDER = ['yes', 'no', 'unclear']
const TRISTATE_LABELS: Record<string, string> = { yes: 'Yes', no: 'No', unclear: 'Not specified' }
const TRISTATE_COLORS: Record<string, string> = { yes: '#4ade80', no: '#ef4444', unclear: '#404040' }

const INDUSTRY_PALETTE = [
  '#818cf8', '#60a5fa', '#2dd4bf', '#4ade80',
  '#fb923c', '#f472b6', '#a78bfa', '#34d399',
]

const PM_TYPE_LABELS: Record<string, string> = {
  core_pm:       'Core PM',
  technical:     'Technical PM',
  customer_facing: 'Customer-facing PM',
  platform:      'Platform PM',
  data_ai:       'Data / AI PM',
  growth:        'Growth PM',
  internal_ops:  'Internal Tools PM',
  data:          'Data PM',
  other:         'Other',
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-base font-semibold text-white tracking-tight mb-6">{children}</h2>
  )
}

function SectionNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-2xs text-subtle -mt-4 mb-6">{children}</p>
  )
}

function ChartCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={['bg-surface border border-border rounded-2xl p-6 sm:p-8', className ?? ''].join(' ')}>
      {children}
    </div>
  )
}

function EditSection({
  title,
  note,
  children,
  className,
}: {
  title: string
  note?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      className={[
        'group-hover/breakdown:opacity-[0.45] hover:!opacity-100 transition-opacity duration-200',
        className ?? '',
      ].join(' ')}
    >
      <SectionTitle>{title}</SectionTitle>
      {note && <SectionNote>{note}</SectionNote>}
      {children}
    </section>
  )
}

// ─── Breakdown filter select ──────────────────────────────────────────────────

function BSelect({
  value,
  isDefault,
  options,
  onChange,
}: {
  value: string
  isDefault: boolean
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}) {
  return (
    <div className="relative shrink-0">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={[
          'appearance-none bg-surface border rounded-full pl-4 pr-8 py-2 text-xs font-medium cursor-pointer focus:outline-none transition-colors shrink-0',
          isDefault
            ? 'border-white/20 text-white/65 hover:border-white/35 hover:text-white/90'
            : 'border-accent/75 text-white bg-accent/10',
        ].join(' ')}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <span
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-subtle leading-none"
        style={{ fontSize: '9px' }}
      >
        ▾
      </span>
    </div>
  )
}

// ─── Domain × Strength stacked bar (pre-computed, not filterable) ─────────────

function DomainStrengthChart({
  data,
  onRowClick,
}: {
  data: NonNullable<Distributions['domain_req_breakdown']>
  onRowClick?: (domain: string, label: string) => void
}) {
  const meaningful = data.filter((d) => d.hard + d.soft > 0)
  if (!meaningful.length) return <EmptyState message="Domain requirement data will appear here once enrichment builds up." />

  const maxTotal = Math.max(...meaningful.map((d) => d.hard + d.soft))

  return (
    <div>
      <div className="space-y-3">
        {meaningful.map((d) => {
          const total = d.hard + d.soft
          const hardPct = total > 0 ? (d.hard / total) * 100 : 0
          const softPct = total > 0 ? (d.soft / total) * 100 : 0
          const barWidth = maxTotal > 0 ? (total / maxTotal) * 100 : 0
          const label = DOMAIN_LABELS[d.domain] ?? d.domain
          return (
            <div
              key={d.domain}
              onClick={onRowClick ? () => onRowClick(d.domain, label) : undefined}
              className={[
                'flex items-center gap-3 rounded-lg transition-all duration-150',
                onRowClick ? 'cursor-pointer hover:bg-surface-elevated px-2 -mx-2 py-1' : '',
              ].join(' ')}
            >
              <span className="text-sm text-muted w-52 shrink-0 truncate">{label}</span>
              <div className="flex-1 h-1.5 bg-surface-elevated rounded-full overflow-hidden">
                <div className="h-full flex" style={{ width: `${barWidth}%` }}>
                  <div className="h-full bg-[#818cf8]" style={{ width: `${hardPct}%` }} />
                  <div className="h-full bg-[#60a5fa] opacity-60" style={{ width: `${softPct}%` }} />
                </div>
              </div>
              <span className="text-xs tabular-nums text-right shrink-0 w-24">
                {d.hard > 0 && <span className="text-white/70">{d.hard} req</span>}
                {d.hard > 0 && d.soft > 0 && <span className="text-white/30"> · </span>}
                {d.soft > 0 && <span className="text-white/50">{d.soft} pref</span>}
              </span>
            </div>
          )
        })}
      </div>
      <div className="flex gap-5 mt-5 pt-5 border-t border-white/[0.05]">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#818cf8]" />
          <span className="text-2xs text-muted">Required</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#60a5fa] opacity-60" />
          <span className="text-2xs text-muted">Preferred</span>
        </div>
      </div>
    </div>
  )
}

// ─── Bubble chart tooltip ─────────────────────────────────────────────────────

function BubbleTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null
  return (
    <div className="bg-surface-elevated border border-border-strong rounded-lg px-3 py-2.5 shadow-xl">
      <p className="text-sm text-white font-medium">{d.xLabel}</p>
      <p className="text-xs text-muted mt-1">{d.y} years minimum</p>
      <p className="text-xs text-white/50 mt-0.5">{d.z} {d.z === 1 ? 'role' : 'roles'}</p>
    </div>
  )
}

// ─── Seniority × Experience bubble chart ─────────────────────────────────────

type SeniorityBubbleRow = { seniority: string; years_min: number; count: number }

function SeniorityBubbleChart({
  data,
  onBubbleClick,
}: {
  data: SeniorityBubbleRow[]
  onBubbleClick?: (seniority: string, label: string) => void
}) {
  if (!data.length) return <EmptyState message="Experience data will appear here once enrichment builds up." />

  const cats = SENIORITY_ORDER.filter((s) => data.some((d) => d.seniority === s))
  const chartData = data
    .filter((d) => cats.includes(d.seniority))
    .map((d) => ({
      x: cats.indexOf(d.seniority) + 1,
      y: d.years_min,
      z: d.count,
      xLabel: SENIORITY_LABELS[d.seniority] ?? d.seniority,
      key: d.seniority,
    }))

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ScatterChart margin={{ top: 10, right: 16, bottom: 20, left: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="0" stroke="rgba(255,255,255,0.04)" />
        <XAxis
          type="number" dataKey="x"
          domain={[0, cats.length + 1]}
          ticks={cats.map((_, i) => i + 1)}
          tickFormatter={(v) => { const c = cats[v - 1]; return c ? (SENIORITY_LABELS[c] ?? c) : '' }}
          tick={{ fontSize: 11, fill: '#737373' }} tickLine={false} axisLine={false}
        />
        <YAxis
          type="number" dataKey="y"
          tick={{ fontSize: 11, fill: '#737373' }} tickLine={false} axisLine={false}
          tickFormatter={(v) => `${v}y`} width={30}
        />
        <ZAxis dataKey="z" range={[50, 700]} />
        <Tooltip content={<BubbleTooltip />} cursor={false} />
        <Scatter
          data={chartData} fill="#818cf8" fillOpacity={0.65}
          onClick={onBubbleClick ? (d: any) => {
            const key = d?.key ?? d?.payload?.key
            const label = d?.xLabel ?? d?.payload?.xLabel
            if (key && label) onBubbleClick(key, label)
          } : undefined}
          style={onBubbleClick ? { cursor: 'pointer' } : undefined}
          shape={(props: any) => {
            const { cx, cy, size, fill, fillOpacity: fo } = props
            const r = Math.sqrt(Math.max(size, 0) / Math.PI)
            return (
              <g>
                <circle cx={cx} cy={cy} r={Math.max(r, 14)} fill="transparent" />
                <circle cx={cx} cy={cy} r={Math.max(r, 1)} fill={fill ?? '#818cf8'} fillOpacity={fo ?? 0.65} />
              </g>
            )
          }}
        />
      </ScatterChart>
    </ResponsiveContainer>
  )
}

// ─── Industry × Experience bubble chart ──────────────────────────────────────

type IndustryBubbleRow = { industry: string; years_min: number; count: number }

function IndustryBubbleChart({
  data,
  onBubbleClick,
}: {
  data: IndustryBubbleRow[]
  onBubbleClick?: (industry: string, label: string) => void
}) {
  if (!data.length) return <EmptyState message="Industry × experience data will appear here once enrichment builds up." />

  const allCats = Array.from(new Set(data.map((d) => d.industry)))
  const chartData = data.map((d) => ({
    x: allCats.indexOf(d.industry) + 1,
    y: d.years_min,
    z: d.count,
    xLabel: INDUSTRY_LABELS[d.industry] ?? d.industry,
    key: d.industry,
  }))

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ScatterChart margin={{ top: 10, right: 16, bottom: 20, left: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="0" stroke="rgba(255,255,255,0.04)" />
        <XAxis
          type="number" dataKey="x"
          domain={[0, allCats.length + 1]}
          ticks={allCats.map((_, i) => i + 1)}
          tickFormatter={(v) => { const c = allCats[v - 1]; return c ? (INDUSTRY_LABELS[c] ?? c) : '' }}
          tick={{ fontSize: 11, fill: '#737373' }} tickLine={false} axisLine={false}
        />
        <YAxis
          type="number" dataKey="y"
          tick={{ fontSize: 11, fill: '#737373' }} tickLine={false} axisLine={false}
          tickFormatter={(v) => `${v}y`} width={30}
        />
        <ZAxis dataKey="z" range={[50, 700]} />
        <Tooltip content={<BubbleTooltip />} cursor={false} />
        <Scatter
          data={chartData} fill="#a78bfa" fillOpacity={0.65}
          onClick={onBubbleClick ? (d: any) => {
            const key = d?.key ?? d?.payload?.key
            const label = d?.xLabel ?? d?.payload?.xLabel
            if (key && label) onBubbleClick(key, label)
          } : undefined}
          style={onBubbleClick ? { cursor: 'pointer' } : undefined}
          shape={(props: any) => {
            const { cx, cy, size, fill, fillOpacity: fo } = props
            const r = Math.sqrt(Math.max(size, 0) / Math.PI)
            return (
              <g>
                <circle cx={cx} cy={cy} r={Math.max(r, 14)} fill="transparent" />
                <circle cx={cx} cy={cy} r={Math.max(r, 1)} fill={fill ?? '#a78bfa'} fillOpacity={fo ?? 0.65} />
              </g>
            )
          }}
        />
      </ScatterChart>
    </ResponsiveContainer>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  dist: Distributions
  jobs: Job[]
}

export default function BreakdownClient({ dist, jobs }: Props) {
  const [filters, setFilters] = useState<BreakdownFilterState>(DEFAULT_BREAKDOWN_FILTERS)
  const [drillTarget, setDrillTarget] = useState<DrillTarget | null>(null)
  const [apiDrillParams, setApiDrillParams] = useState<{ chart_id: string; segment_key: string } | null>(null)
  const [activeChartId, setActiveChartId] = useState<string | null>(null)
  const [activeKey, setActiveKey] = useState<string | null>(null)

  function handleDrill(chartId: string, segKey: string, label: string, uiKey?: string) {
    const uiActiveKey = uiKey ?? segKey
    if (activeChartId === chartId && activeKey === uiActiveKey) {
      setDrillTarget(null)
      setApiDrillParams(null)
      setActiveChartId(null)
      setActiveKey(null)
      return
    }
    setDrillTarget({ dimension: chartId, keys: [segKey], label })
    setApiDrillParams({ chart_id: chartId, segment_key: segKey })
    setActiveChartId(chartId)
    setActiveKey(uiActiveKey)
  }

  function handleClose() {
    setDrillTarget(null)
    setApiDrillParams(null)
    setActiveChartId(null)
    setActiveKey(null)
  }

  // ── Filtered jobs (time window + all other filters) ──────────────────────

  const filteredJobs = useMemo(() => {
    const days = TIME_WINDOW_DAYS[filters.timeWindow]
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)
    const cutoffStr = cutoff.toISOString().split('T')[0]

    return jobs.filter((j) => {
      if (!j.first_seen_date || j.first_seen_date < cutoffStr) return false

      if (filters.seniority !== 'all') {
        const map: Record<string, string[]> = {
          junior: ['junior'],
          mid: ['mid'],
          senior: ['senior', 'mid_senior'],
          lead: ['lead', 'staff', 'group', 'principal', 'head'],
        }
        const targets = new Set(map[filters.seniority] ?? [])
        if (!targets.has(j.seniority)) return false
      }

      if (filters.roleFamily !== 'all' && j.pm_type !== filters.roleFamily) return false

      if (filters.language !== 'all' && j.language !== filters.language) return false

      if (filters.germanReq !== 'all' && j.german_req !== filters.germanReq) return false

      if (filters.workMode !== 'all') {
        if (filters.workMode === 'hybrid') {
          if (!j.work_mode.startsWith('hybrid')) return false
        } else {
          if (j.work_mode !== filters.workMode) return false
        }
      }

      return true
    })
  }, [jobs, filters])

  // ── Computed distributions from filtered jobs ────────────────────────────

  const filteredSeniority = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const j of filteredJobs) counts[j.seniority] = (counts[j.seniority] ?? 0) + 1
    return SENIORITY_ORDER
      .map((k) => {
        const count = counts[k] ?? 0
        if (!count) return null
        return { label: SENIORITY_LABELS[k] ?? k, count, color: SENIORITY_COLORS[k] ?? '#818cf8', drillKey: k }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
  }, [filteredJobs])

  const filteredCompanies = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const j of filteredJobs) {
      if (j.company) counts[j.company] = (counts[j.company] ?? 0) + 1
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([label, count]) => ({ label, count, color: '#818cf8', drillKey: label }))
  }, [filteredJobs])

  const filteredWorkMode = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const j of filteredJobs) counts[j.work_mode] = (counts[j.work_mode] ?? 0) + 1
    return WORK_MODE_ORDER
      .map((k) => {
        const count = counts[k] ?? 0
        if (!count) return null
        return { label: WORK_MODE_LABELS[k] ?? k, count, color: WORK_MODE_COLORS[k] ?? '#818cf8', drillKey: k }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
  }, [filteredJobs])

  const filteredIndustry = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const j of filteredJobs) {
      if (j.industry) counts[j.industry] = (counts[j.industry] ?? 0) + 1
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([key, count], idx) => ({
        label: INDUSTRY_LABELS[key] ?? key,
        count,
        color: INDUSTRY_PALETTE[idx % INDUSTRY_PALETTE.length],
        drillKey: key,
      }))
  }, [filteredJobs])

  const seniorityBubbleData = useMemo((): SeniorityBubbleRow[] => {
    const counts: Record<string, SeniorityBubbleRow> = {}
    for (const j of filteredJobs) {
      if (!j.seniority || j.years_experience_min == null) continue
      const key = `${j.seniority}_${j.years_experience_min}`
      if (!counts[key]) counts[key] = { seniority: j.seniority, years_min: j.years_experience_min, count: 0 }
      counts[key].count++
    }
    return Object.values(counts)
  }, [filteredJobs])

  const industryBubbleData = useMemo((): IndustryBubbleRow[] => {
    const counts: Record<string, IndustryBubbleRow> = {}
    for (const j of filteredJobs) {
      if (!j.industry || j.years_experience_min == null) continue
      const key = `${j.industry}_${j.years_experience_min}`
      if (!counts[key]) counts[key] = { industry: j.industry, years_min: j.years_experience_min, count: 0 }
      counts[key].count++
    }
    return Object.values(counts)
  }, [filteredJobs])

  // ── Insight strip metrics ────────────────────────────────────────────────

  const insightTotal = filteredJobs.length
  const insightGermanPct = insightTotal > 0
    ? Math.round(
        filteredJobs.filter((j) => j.german_req === 'must' || j.language === 'de').length / insightTotal * 100
      )
    : 0
  const SENIOR_PLUS = new Set(['senior', 'mid_senior', 'lead', 'staff', 'group', 'principal'])
  const insightSeniorPct = insightTotal > 0
    ? Math.round(filteredJobs.filter((j) => SENIOR_PLUS.has(j.seniority)).length / insightTotal * 100)
    : 0

  // ── Pre-computed fallbacks (not filterable by time window) ───────────────

  const visaItems = TRISTATE_ORDER
    .map((k) => {
      const item = (dist.visa_sponsorship ?? []).find((d) => d.label === k)
      if (!item || item.count === 0) return null
      return { label: TRISTATE_LABELS[k], count: item.count, color: TRISTATE_COLORS[k], drillKey: k }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)

  const relocItems = TRISTATE_ORDER
    .map((k) => {
      const item = (dist.relocation_support ?? []).find((d) => d.label === k)
      if (!item || item.count === 0) return null
      return { label: TRISTATE_LABELS[k], count: item.count, color: TRISTATE_COLORS[k], drillKey: k }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)

  const timeLabel = TIME_WINDOW_LABEL[filters.timeWindow]
  const isActive = hasActiveFilter(filters)

  return (
    <>
      {/* ── Page header ── */}
      <div className="pt-2 pb-6 border-b border-border">
        <h1 className="text-2xl font-bold tracking-tight text-white mb-2">Breakdown</h1>
        <p className="text-sm text-muted max-w-xl">
          A structural view of hiring patterns based on jobs posted in the last {timeLabel}.
        </p>
        {/* Scope chip row */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-3">
          <span className="text-2xs text-subtle">Scope: Jobs posted in the last {timeLabel}</span>
          <span className="text-2xs text-subtle/30">·</span>
          <span className="text-2xs text-subtle">Region: Berlin + remote Germany</span>
        </div>
      </div>

      {/* ── Breakdown filter bar ── */}
      <div className="sticky top-16 z-40 bg-bg -mx-6 px-6 pt-3 pb-3 mb-2 sm:static sm:bg-transparent sm:mx-0 sm:px-0 sm:pt-4 sm:pb-0 sm:mb-8">
        <div className="relative">
          <div className="flex items-center gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <BSelect
              value={filters.timeWindow}
              isDefault={filters.timeWindow === '90d'}
              onChange={(v) => setFilters({ ...filters, timeWindow: v as TimeWindow })}
              options={[
                { value: '30d', label: 'Last 30 days' },
                { value: '60d', label: 'Last 60 days' },
                { value: '90d', label: 'Last 90 days' },
                { value: '180d', label: 'Last 180 days' },
              ]}
            />
            <BSelect
              value={filters.seniority}
              isDefault={filters.seniority === 'all'}
              onChange={(v) => setFilters({ ...filters, seniority: v as BreakdownFilterState['seniority'] })}
              options={[
                { value: 'all', label: 'All levels' },
                { value: 'junior', label: 'Junior' },
                { value: 'mid', label: 'Mid' },
                { value: 'senior', label: 'Senior' },
                { value: 'lead', label: 'Lead+' },
              ]}
            />
            <BSelect
              value={filters.roleFamily}
              isDefault={filters.roleFamily === 'all'}
              onChange={(v) => setFilters({ ...filters, roleFamily: v })}
              options={[
                { value: 'all', label: 'All role types' },
                { value: 'core_pm', label: 'Core PM' },
                { value: 'technical', label: 'Technical PM' },
                { value: 'customer_facing', label: 'Customer-facing' },
                { value: 'platform', label: 'Platform PM' },
                { value: 'data_ai', label: 'Data / AI PM' },
                { value: 'growth', label: 'Growth PM' },
                { value: 'internal_ops', label: 'Internal Tools' },
              ]}
            />
            <BSelect
              value={filters.language}
              isDefault={filters.language === 'all'}
              onChange={(v) => setFilters({ ...filters, language: v as BreakdownFilterState['language'] })}
              options={[
                { value: 'all', label: 'All languages' },
                { value: 'en', label: 'English posting' },
                { value: 'de', label: 'German posting' },
              ]}
            />
            <BSelect
              value={filters.germanReq}
              isDefault={filters.germanReq === 'all'}
              onChange={(v) => setFilters({ ...filters, germanReq: v as BreakdownFilterState['germanReq'] })}
              options={[
                { value: 'all', label: 'German req: any' },
                { value: 'not_mentioned', label: 'No German req' },
                { value: 'plus', label: 'German a plus' },
                { value: 'must', label: 'German required' },
              ]}
            />
            <BSelect
              value={filters.workMode}
              isDefault={filters.workMode === 'all'}
              onChange={(v) => setFilters({ ...filters, workMode: v as BreakdownFilterState['workMode'] })}
              options={[
                { value: 'all', label: 'All work modes' },
                { value: 'remote', label: 'Remote' },
                { value: 'hybrid', label: 'Hybrid' },
                { value: 'onsite', label: 'On-site' },
              ]}
            />
            {isActive && (
              <button
                onClick={() => setFilters(DEFAULT_BREAKDOWN_FILTERS)}
                className="shrink-0 text-2xs text-subtle hover:text-white transition-colors px-2 py-1.5 rounded-full hover:bg-surface whitespace-nowrap"
              >
                Reset
              </button>
            )}
          </div>
          {/* Right-edge fade for mobile scroll hint */}
          <div
            className="absolute right-0 top-0 h-full w-16 pointer-events-none sm:hidden"
            style={{ background: 'linear-gradient(to right, transparent, #0a0a0a)' }}
          />
        </div>
      </div>

      {/* ── Insight strip ── */}
      {insightTotal > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-12">
          <div className="bg-surface border border-border rounded-xl px-4 py-3">
            <p className="text-2xl font-bold text-white tabular-nums leading-none">{insightTotal}</p>
            <p className="text-xs text-muted mt-1.5">roles in window</p>
          </div>
          <div className="bg-surface border border-border rounded-xl px-4 py-3">
            <p className="text-2xl font-bold text-white tabular-nums leading-none">{insightGermanPct}%</p>
            <p className="text-xs text-muted mt-1.5">require German</p>
          </div>
          <div className="bg-surface border border-border rounded-xl px-4 py-3">
            <p className="text-2xl font-bold text-white tabular-nums leading-none">{insightSeniorPct}%</p>
            <p className="text-xs text-muted mt-1.5">Senior or above</p>
          </div>
        </div>
      )}

      {insightTotal === 0 && (
        <div className="mb-12">
          <EmptyState message="No jobs match the current filters. Try widening the time window or removing a filter." />
        </div>
      )}

      {/* All sections share a single hover-dim group */}
      <div className="group/breakdown">

        {/* ── 1. Seniority vs required experience ── */}
        <EditSection title="Seniority vs required experience" className="mt-16">
          <ChartCard>
            {seniorityBubbleData.length > 0 ? (
              <SeniorityBubbleChart
                data={seniorityBubbleData}
                onBubbleClick={(seniority, label) => handleDrill('seniority', seniority, label)}
              />
            ) : filteredSeniority.length > 0 ? (
              <StatBar
                items={filteredSeniority}
                showPct
                onBarClick={(key, label) => handleDrill('seniority', key, label)}
                activeKey={activeChartId === 'seniority' ? activeKey : null}
              />
            ) : (
              <EmptyState message="No seniority data for this selection." />
            )}
          </ChartCard>
        </EditSection>

        {/* ── 2. Which backgrounds companies want ── */}
        <EditSection
          title="Which backgrounds companies want"
          note="Based on the full enriched dataset — domain requirement data is not available per individual job."
          className="mt-24"
        >
          {(dist.domain_req_breakdown ?? []).filter((d) => d.hard + d.soft > 0).length > 0 ? (
            <ChartCard>
              <DomainStrengthChart
                data={dist.domain_req_breakdown!}
                onRowClick={(domain, label) => handleDrill('domain_requirement', domain, label)}
              />
            </ChartCard>
          ) : (
            <EmptyState message="Domain requirement data will appear here once enrichment builds up." />
          )}
        </EditSection>

        {/* ── 3. Companies with the most openings ── */}
        <EditSection title="Companies with the most openings" className="mt-20">
          {filteredCompanies.length > 0 ? (
            <ChartCard>
              <StatBar
                items={filteredCompanies}
                showPct={false}
                onBarClick={(key, label) => handleDrill('company', key, label)}
                activeKey={activeChartId === 'company' ? activeKey : null}
              />
            </ChartCard>
          ) : (
            <EmptyState message="No company data for this selection." />
          )}
        </EditSection>

        {/* ── 4. Work setup ── */}
        <EditSection title="Work setup" className="mt-20">
          {filteredWorkMode.length > 0 ? (
            <ChartCard>
              <StatBar
                items={filteredWorkMode}
                showPct
                onBarClick={(rawKey, label) => {
                  const segKey = HYBRID_RAW_KEYS.has(rawKey) ? 'hybrid' : rawKey
                  handleDrill('work_mode', segKey, label, rawKey)
                }}
                activeKey={activeChartId === 'work_mode' ? activeKey : null}
              />
            </ChartCard>
          ) : (
            <EmptyState message="No work mode data for this selection." />
          )}
        </EditSection>

        {/* ── 5. Industry vs required experience ── */}
        <EditSection title="Industry vs required experience" className="mt-24">
          <ChartCard>
            {industryBubbleData.length > 0 ? (
              <IndustryBubbleChart
                data={industryBubbleData}
                onBubbleClick={(industry, label) => handleDrill('industry', industry, label)}
              />
            ) : filteredIndustry.length > 0 ? (
              <StatBar
                items={filteredIndustry}
                showPct
                onBarClick={(key, label) => handleDrill('industry', key, label)}
                activeKey={activeChartId === 'industry' ? activeKey : null}
              />
            ) : (
              <EmptyState message="No industry data for this selection." />
            )}
          </ChartCard>
        </EditSection>

        {/* ── 6 + 7. Visa sponsorship + Relocation support (paired, lower priority) ── */}
        {(visaItems.length > 0 || relocItems.length > 0) && (
          <div className="group-hover/breakdown:opacity-[0.45] hover:!opacity-100 transition-opacity duration-200 mt-16 grid grid-cols-1 sm:grid-cols-2 gap-10">
            <section>
              <SectionTitle>Visa sponsorship</SectionTitle>
              <SectionNote>Based on the full enriched dataset.</SectionNote>
              {visaItems.length > 0 ? (
                <ChartCard>
                  <StatBar
                    items={visaItems}
                    showPct={false}
                    onBarClick={(key, label) => handleDrill('visa_sponsorship', key, label)}
                    activeKey={activeChartId === 'visa_sponsorship' ? activeKey : null}
                  />
                </ChartCard>
              ) : (
                <EmptyState message="No visa sponsorship data yet." />
              )}
            </section>
            <section>
              <SectionTitle>Relocation support</SectionTitle>
              <SectionNote>Based on the full enriched dataset.</SectionNote>
              {relocItems.length > 0 ? (
                <ChartCard>
                  <StatBar
                    items={relocItems}
                    showPct={false}
                    onBarClick={(key, label) => handleDrill('relocation_support', key, label)}
                    activeKey={activeChartId === 'relocation_support' ? activeKey : null}
                  />
                </ChartCard>
              ) : (
                <EmptyState message="No relocation support data yet." />
              )}
            </section>
          </div>
        )}

      </div>

      {/* ── Drill-down panel ── */}
      <DrillDownPanel
        target={drillTarget}
        apiParams={apiDrillParams}
        filters={DEFAULT_FILTERS}
        onClose={handleClose}
      />
    </>
  )
}
