'use client'

import { useState } from 'react'
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import type { Distributions } from '@/types/data'
import { StatBar } from '@/components/stat-bar'
import { EmptyState } from '@/components/section'
import { DrillDownPanel, type DrillTarget } from '@/components/drill-down-panel'
import { DEFAULT_FILTERS } from '@/components/filter-bar'

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

const INDUSTRY_ORDER = [
  'saas_b2b_software', 'fintech_payments', 'ecommerce_marketplace', 'consumer_apps',
  'healthtech_biotech', 'mobility_automotive', 'logistics_supply_chain',
  'media_entertainment', 'cybersecurity', 'hrtech_future_of_work', 'proptech_construction', 'other',
]
const INDUSTRY_LABELS: Record<string, string> = {
  saas_b2b_software:     'SaaS / B2B',
  fintech_payments:      'Fintech',
  ecommerce_marketplace: 'E-commerce',
  consumer_apps:         'Consumer apps',
  healthtech_biotech:    'Healthtech',
  mobility_automotive:   'Mobility',
  logistics_supply_chain:'Logistics',
  media_entertainment:   'Media',
  cybersecurity:         'Cybersecurity',
  hrtech_future_of_work: 'HR tech',
  proptech_construction: 'Proptech',
  other:                 'Other',
  // taxonomy values
  fintech:                    'Fintech',
  payments:                   'Payments',
  banking_financial_services: 'Banking / Financial',
  ai_ml_data_products:        'AI / ML / Data',
  consumer_digital_products:  'Consumer Digital',
  enterprise_internal_tools:  'Enterprise / Internal',
  healthtech:                 'Healthtech',
}

const DOMAIN_LABELS: Record<string, string> = {
  payments:                  'Payments',
  banking_financial_services:'Banking / Financial',
  fintech:                   'Fintech',
  ecommerce_marketplace:     'E-commerce',
  saas_b2b_software:         'SaaS / B2B',
  mobility_automotive:       'Mobility / Automotive',
  logistics_supply_chain:    'Logistics',
  ai_ml_data_products:       'AI / ML / Data',
  consumer_digital_products: 'Consumer Digital',
  enterprise_internal_tools: 'Enterprise / Internal Tools',
  cybersecurity:             'Cybersecurity',
  healthtech:                'Healthtech',
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
// hybrid_Xd variants all map to 'hybrid' for the drilldown API
const HYBRID_RAW_KEYS = new Set(['hybrid_1d', 'hybrid_2d', 'hybrid_3d', 'hybrid_4d'])

const TRISTATE_ORDER = ['yes', 'no', 'unclear']
const TRISTATE_LABELS: Record<string, string> = {
  yes:    'Yes',
  no:     'No',
  unclear:'Not specified',
}
const TRISTATE_COLORS: Record<string, string> = {
  yes:    '#4ade80',
  no:     '#ef4444',
  unclear:'#404040',
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-base font-semibold text-white tracking-tight mb-6">{children}</h2>
  )
}

function ChartCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={['bg-surface border border-border rounded-2xl p-6 sm:p-8', className ?? ''].join(' ')}>
      {children}
    </div>
  )
}

// Hover-dimmable section wrapper.
// Uses group-hover/breakdown defined on the parent container.
function EditSection({
  title,
  children,
  className,
}: {
  title: string
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
      {children}
    </section>
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

function SeniorityBubbleChart({
  data,
  onBubbleClick,
}: {
  data: NonNullable<Distributions['seniority_experience_bubble']>
  onBubbleClick?: (seniority: string, label: string) => void
}) {
  if (!data.length) {
    return (
      <EmptyState message="Experience data will appear here once enrichment builds up." />
    )
  }

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
          type="number"
          dataKey="x"
          domain={[0, cats.length + 1]}
          ticks={cats.map((_, i) => i + 1)}
          tickFormatter={(v) => {
            const c = cats[v - 1]
            return c ? (SENIORITY_LABELS[c] ?? c) : ''
          }}
          tick={{ fontSize: 11, fill: '#737373' }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          type="number"
          dataKey="y"
          tick={{ fontSize: 11, fill: '#737373' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `${v}y`}
          width={30}
        />
        <ZAxis dataKey="z" range={[50, 700]} />
        <Tooltip content={<BubbleTooltip />} cursor={false} />
        <Scatter
          data={chartData}
          fill="#818cf8"
          fillOpacity={0.65}
          onClick={onBubbleClick
            ? (data: any) => {
                const key = data?.key ?? data?.payload?.key
                const label = data?.xLabel ?? data?.payload?.xLabel
                if (key && label) onBubbleClick(key, label)
              }
            : undefined}
          style={onBubbleClick ? { cursor: 'pointer' } : undefined}
          shape={(props: any) => {
            const { cx, cy, size, fill, fillOpacity: fo } = props
            const r = Math.sqrt(Math.max(size, 0) / Math.PI)
            return (
              <g>
                {/* transparent hit area — ensures small bubbles are still clickable */}
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

function IndustryBubbleChart({
  data,
  onBubbleClick,
}: {
  data: NonNullable<Distributions['industry_experience_bubble']>
  onBubbleClick?: (industry: string, label: string) => void
}) {
  if (!data.length) {
    return (
      <EmptyState message="Industry × experience data will appear here once enrichment builds up." />
    )
  }

  const cats = INDUSTRY_ORDER.filter((i) => data.some((d) => d.industry === i))
  // Also include any taxonomy values not in INDUSTRY_ORDER
  const extraCats = data.map((d) => d.industry).filter((i) => !cats.includes(i))
  const allCats = [...cats, ...extraCats]

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
          type="number"
          dataKey="x"
          domain={[0, allCats.length + 1]}
          ticks={allCats.map((_, i) => i + 1)}
          tickFormatter={(v) => {
            const c = allCats[v - 1]
            return c ? (INDUSTRY_LABELS[c] ?? c) : ''
          }}
          tick={{ fontSize: 11, fill: '#737373' }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          type="number"
          dataKey="y"
          tick={{ fontSize: 11, fill: '#737373' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `${v}y`}
          width={30}
        />
        <ZAxis dataKey="z" range={[50, 700]} />
        <Tooltip content={<BubbleTooltip />} cursor={false} />
        <Scatter
          data={chartData}
          fill="#a78bfa"
          fillOpacity={0.65}
          onClick={onBubbleClick
            ? (d: any) => {
                const key = d?.key ?? d?.payload?.key
                const label = d?.xLabel ?? d?.payload?.xLabel
                if (key && label) onBubbleClick(key, label)
              }
            : undefined}
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

// ─── Domain × Strength stacked bar ───────────────────────────────────────────

function DomainStrengthChart({
  data,
  onRowClick,
}: {
  data: NonNullable<Distributions['domain_req_breakdown']>
  onRowClick?: (domain: string, label: string) => void
}) {
  const meaningful = data.filter((d) => d.hard + d.soft > 0)
  if (!meaningful.length) {
    return (
      <EmptyState message="Domain requirement data will appear here once enrichment builds up." />
    )
  }

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

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  dist: Distributions
}

export default function BreakdownClient({ dist }: Props) {
  const [drillTarget, setDrillTarget] = useState<DrillTarget | null>(null)
  const [apiDrillParams, setApiDrillParams] = useState<{
    chart_id: string
    segment_key: string
  } | null>(null)
  const [activeChartId, setActiveChartId] = useState<string | null>(null)
  const [activeKey, setActiveKey] = useState<string | null>(null)

  function handleDrill(chartId: string, segKey: string, label: string, uiKey?: string) {
    const uiActiveKey = uiKey ?? segKey
    // Toggle off if same segment clicked again
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

  // Work mode — intentional order, full hybrid breakdown
  const workModeItems = WORK_MODE_ORDER
    .map((key) => {
      const item = dist.work_mode.find((m) => m.label === key)
      if (!item || item.count === 0) return null
      return {
        label: WORK_MODE_LABELS[key] ?? key,
        count: item.count,
        color: WORK_MODE_COLORS[key] ?? '#818cf8',
        drillKey: key,
      }
    })
    .filter((x): x is { label: string; count: number; color: string; drillKey: string } => x !== null)

  // Visa sponsorship
  const visaItems = TRISTATE_ORDER
    .map((k) => {
      const item = (dist.visa_sponsorship ?? []).find((d) => d.label === k)
      if (!item || item.count === 0) return null
      return { label: TRISTATE_LABELS[k], count: item.count, color: TRISTATE_COLORS[k], drillKey: k }
    })
    .filter((x): x is { label: string; count: number; color: string; drillKey: string } => x !== null)

  // Relocation support
  const relocItems = TRISTATE_ORDER
    .map((k) => {
      const item = (dist.relocation_support ?? []).find((d) => d.label === k)
      if (!item || item.count === 0) return null
      return { label: TRISTATE_LABELS[k], count: item.count, color: TRISTATE_COLORS[k], drillKey: k }
    })
    .filter((x): x is { label: string; count: number; color: string; drillKey: string } => x !== null)

  // Companies — top 15 sorted by count (already sorted in export)
  const companyItems = dist.companies.top20.slice(0, 15).map((c) => ({
    label: c.label,
    count: c.count,
    color: '#818cf8',
    drillKey: c.label,
  }))

  // Fallback: years_experience buckets (section 1)
  const EXP_BUCKET_COLORS = ['#4ade80', '#60a5fa', '#818cf8', '#a78bfa']
  const yearsExpFallback = (dist.years_experience?.buckets ?? [])
    .filter((b) => b.count > 0)
    .map((b, i) => ({ label: b.label, count: b.count, color: EXP_BUCKET_COLORS[i] ?? '#818cf8' }))

  // Fallback: domain req strength (section 2)
  const STRENGTH_LABELS: Record<string, string> = {
    hard:    'Required',
    soft:    'Preferred',
    unclear: 'Unclear',
    none:    'No requirement',
  }
  const STRENGTH_COLORS: Record<string, string> = {
    hard:    '#818cf8',
    soft:    '#60a5fa',
    unclear: '#404040',
    none:    '#3a3a3a',
  }
  const STRENGTH_ORDER = ['hard', 'soft', 'unclear', 'none']
  const domainStrengthFallback = STRENGTH_ORDER
    .map((k) => {
      const item = (dist.domain_req_strength ?? []).find((d) => d.label === k)
      if (!item || item.count === 0) return null
      return { label: STRENGTH_LABELS[k], count: item.count, color: STRENGTH_COLORS[k], drillKey: k }
    })
    .filter((x): x is { label: string; count: number; color: string; drillKey: string } => x !== null)

  // Fallback: industry_normalized (section 4)
  const INDUSTRY_PALETTE = ['#818cf8', '#60a5fa', '#2dd4bf', '#4ade80', '#fb923c', '#f472b6', '#a78bfa', '#34d399']
  const industryFallback = (dist.industry_normalized ?? [])
    .filter((i) => i.count > 0)
    .map((i, idx) => ({
      label: INDUSTRY_LABELS[i.label] ?? i.label,
      count: i.count,
      color: INDUSTRY_PALETTE[idx % INDUSTRY_PALETTE.length],
      drillKey: i.label,
    }))

  return (
    <>
      {/* Page header */}
      <div className="pt-2 pb-14 border-b border-border">
        <h1 className="text-2xl font-bold tracking-tight text-white mb-2">Breakdown</h1>
        <p className="text-sm text-muted max-w-xl">
          Experience expectations, domain signals, hiring concentration, and access constraints.
        </p>
      </div>

      {/* All sections share a single hover-dim group */}
      <div className="group/breakdown">

        {/* ── 1. Seniority vs required experience ── */}
        <EditSection title="Seniority vs required experience" className="mt-24">
          {(dist.seniority_experience_bubble ?? []).length > 0 ? (
            <ChartCard>
              <SeniorityBubbleChart
                data={dist.seniority_experience_bubble!}
                onBubbleClick={(seniority, label) =>
                  handleDrill('seniority', seniority, label)
                }
              />
            </ChartCard>
          ) : yearsExpFallback.length > 0 ? (
            <ChartCard>
              <StatBar items={yearsExpFallback} showPct />
            </ChartCard>
          ) : (
            <EmptyState message="Experience data will appear here once enrichment builds up." />
          )}
        </EditSection>

        {/* ── 2. Which backgrounds companies want ── */}
        <EditSection title="Which backgrounds companies want" className="mt-28">
          {(dist.domain_req_breakdown ?? []).filter((d) => d.hard + d.soft > 0).length > 0 ? (
            <ChartCard>
              <DomainStrengthChart
                data={dist.domain_req_breakdown!}
                onRowClick={(domain, label) =>
                  handleDrill('domain_requirement', domain, label)
                }
              />
            </ChartCard>
          ) : domainStrengthFallback.length > 0 ? (
            <ChartCard>
              <StatBar
                items={domainStrengthFallback}
                showPct
                onBarClick={(key, label) => handleDrill('domain_req_strength', key, label)}
                activeKey={activeChartId === 'domain_req_strength' ? activeKey : null}
              />
            </ChartCard>
          ) : (
            <EmptyState message="Domain requirement data will appear here once enrichment builds up." />
          )}
        </EditSection>

        {/* ── 3. Companies with the most openings ── */}
        <EditSection title="Companies with the most openings" className="mt-20">
          {companyItems.length > 0 ? (
            <ChartCard>
              <StatBar
                items={companyItems}
                showPct={false}
                onBarClick={(key, label) => handleDrill('company', key, label)}
                activeKey={activeChartId === 'company' ? activeKey : null}
              />
            </ChartCard>
          ) : (
            <EmptyState message="Company data is building up." />
          )}
        </EditSection>

        {/* ── 4. Industry vs required experience ── */}
        <EditSection title="Industry vs required experience" className="mt-28">
          {(dist.industry_experience_bubble ?? []).length > 0 ? (
            <ChartCard>
              <IndustryBubbleChart
                data={dist.industry_experience_bubble!}
                onBubbleClick={(industry, label) =>
                  handleDrill('industry', industry, label)
                }
              />
            </ChartCard>
          ) : industryFallback.length > 0 ? (
            <ChartCard>
              <StatBar
                items={industryFallback}
                showPct
                onBarClick={(key, label) => handleDrill('industry', key, label)}
                activeKey={activeChartId === 'industry' ? activeKey : null}
              />
            </ChartCard>
          ) : (
            <EmptyState message="Industry data will appear here once enrichment builds up." />
          )}
        </EditSection>

        {/* ── 5 + 6. Visa sponsorship + Relocation support (paired) ── */}
        <div className="group-hover/breakdown:opacity-[0.45] hover:!opacity-100 transition-opacity duration-200 mt-16 grid grid-cols-1 sm:grid-cols-2 gap-10">
          <section>
            <SectionTitle>Visa sponsorship</SectionTitle>
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

        {/* ── 7. Work setup ── */}
        <EditSection title="Work setup" className="mt-24">
          {workModeItems.length > 0 ? (
            <ChartCard>
              <StatBar
                items={workModeItems}
                showPct
                onBarClick={(rawKey, label) => {
                  const segKey = HYBRID_RAW_KEYS.has(rawKey) ? 'hybrid' : rawKey
                  handleDrill('work_mode', segKey, label, rawKey)
                }}
                activeKey={activeChartId === 'work_mode' ? activeKey : null}
              />
            </ChartCard>
          ) : (
            <EmptyState message="Work mode data is building up." />
          )}
        </EditSection>

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
