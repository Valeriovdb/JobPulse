'use client'

import { useState } from 'react'
import type { Overview, Distributions } from '@/types/data'
import { StatBar, StackedBar } from '@/components/stat-bar'
import { DEFAULT_FILTERS } from '@/components/filter-bar'
import { DrillDownPanel, type DrillTarget } from '@/components/drill-down-panel'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PM_TYPE_LABELS: Record<string, string> = {
  core_pm: 'Core PM',
  technical: 'Technical PM',
  customer_facing: 'Customer-facing PM',
  platform: 'Platform PM',
  data_ai: 'Data / AI PM',
  growth: 'Growth PM',
  internal_ops: 'Internal Tools PM',
  data: 'Data PM',
  other: 'Other',
}

const PM_TYPE_COLORS: Record<string, string> = {
  core_pm: '#818cf8',
  technical: '#60a5fa',
  customer_facing: '#4ade80',
  platform: '#a78bfa',
  data_ai: '#f472b6',
  data: '#f472b6',
  growth: '#fb923c',
  internal_ops: '#34d399',
  other: '#737373',
  unknown: '#404040',
}

const SENIORITY_LABELS: Record<string, string> = {
  junior: 'Junior',
  mid: 'Mid',
  mid_senior: 'Mid–Senior',
  senior: 'Senior',
  lead: 'Lead',
  staff: 'Staff',
  group: 'Group PM',
  principal: 'Principal',
  head: 'Head of PM',
  unknown: 'Unclassified',
}

const SENIORITY_COLORS: Record<string, string> = {
  junior: '#4ade80',
  mid: '#60a5fa',
  mid_senior: '#38bdf8',
  senior: '#818cf8',
  lead: '#a78bfa',
  staff: '#c084fc',
  group: '#e879f9',
  principal: '#f472b6',
  head: '#fb7185',
  unknown: '#404040',
}

const HYBRID_KEYS = new Set(['hybrid', 'hybrid_1d', 'hybrid_2d', 'hybrid_3d', 'hybrid_4d'])

// ---------------------------------------------------------------------------
// Drill-down API mapping
// ---------------------------------------------------------------------------

function toApiParams(
  dimension: string,
  segKey: string,
): { chart_id: string; segment_key: string } | null {
  if (dimension === 'seniority') return { chart_id: 'seniority', segment_key: segKey }
  if (dimension === 'pm_type')   return { chart_id: 'role_type', segment_key: segKey }
  if (dimension === 'location')  return { chart_id: 'location', segment_key: segKey }
  if (dimension === 'work_mode') return { chart_id: 'work_mode', segment_key: segKey }
  if (dimension === 'language') {
    if (segKey === 'en_none') return { chart_id: 'german_requirement', segment_key: 'not_mentioned' }
    if (segKey === 'en_plus') return { chart_id: 'german_requirement', segment_key: 'plus' }
    if (segKey === 'en_must') return { chart_id: 'german_requirement', segment_key: 'must' }
    if (segKey === 'de')      return { chart_id: 'posting_language',   segment_key: 'de' }
  }
  return null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateHeroTitle(
  senior_pct: number,
  accessible_pct: number,
  remotePct: number,
  n_active: number,
): string {
  if (n_active === 0) return 'No active roles in the current snapshot.'

  const isSeniorHeavy = senior_pct >= 60
  const isMidSenior  = senior_pct >= 40 && senior_pct < 60
  const isLanguageConstrained = accessible_pct < 30
  const isLimitedAccess       = accessible_pct >= 30 && accessible_pct < 50
  const isRemoteScarce        = remotePct <= 8

  if (isSeniorHeavy) {
    if (isLanguageConstrained)
      return 'A senior-heavy market with limited English-only access.'
    if (isLimitedAccess && isRemoteScarce)
      return 'Senior-leaning, language-filtered, and mostly on-site.'
    if (isLimitedAccess)
      return 'A senior-leaning market — German opens most of the pipeline.'
    return 'A senior-heavy market, broadly accessible across languages.'
  }

  if (isMidSenior) {
    if (isLanguageConstrained)
      return 'A competitive market where German is the main barrier.'
    if (isLimitedAccess && isRemoteScarce)
      return 'A mid-to-senior market with real language and location constraints.'
    if (isLimitedAccess)
      return 'A competitive market tilted toward experienced PMs.'
    return 'A mid-to-senior market, competitive but broadly accessible.'
  }

  // Balanced seniority
  if (isLanguageConstrained)
    return 'Language is the primary barrier — German unlocks most roles.'
  if (isLimitedAccess)
    return 'A mixed market with moderate language constraints.'
  return 'A broadly accessible market with distributed seniority.'
}

function generateHeroBody(
  n_active: number,
  senior_pct: number,
  accessible_pct: number,
  remotePct: number,
): string {
  if (n_active === 0) return 'No active roles in the current snapshot.'

  const base = `${n_active} roles tracked across Berlin and remote Germany.`

  if (senior_pct >= 50 && accessible_pct < 50) {
    return `${base} ${senior_pct}% are Senior-level or above, and only ${accessible_pct}% list no German requirement.`
  }
  if (senior_pct >= 50) {
    const remoteClause = remotePct <= 8
      ? `Remote is scarce — only ${remotePct}% of roles offer it.`
      : `Remote accounts for ${remotePct}% of listings.`
    return `${base} ${senior_pct}% are Senior-level or above. ${remoteClause}`
  }
  if (accessible_pct < 40) {
    return `${base} Only ${accessible_pct}% list no German requirement — language is the clearest access constraint.`
  }
  return `${base} ${accessible_pct}% are accessible without German. Remote accounts for ${remotePct}% of listings.`
}

function generateImplications(
  n_active: number,
  senior_pct: number,
  accessible_pct: number,
  location: Overview['location'],
  ai: Distributions['ai'],
): string[] {
  if (n_active === 0) return []
  const remotePct = Math.round((location.remote_germany / n_active) * 100)
  const implications: string[] = []

  // Language / access
  if (accessible_pct >= 50) {
    implications.push(
      `English-only candidates can reach about ${accessible_pct}% of active roles. German fluency opens the rest.`
    )
  } else if (accessible_pct >= 25) {
    implications.push(
      `Without German, ${accessible_pct}% of roles are reachable. Adding German more than doubles the addressable pool.`
    )
  } else if (accessible_pct > 0) {
    implications.push(
      `German is near-essential in this snapshot — only ${accessible_pct}% of roles list no language requirement.`
    )
  }

  // Remote
  if (remotePct <= 10) {
    implications.push(
      `Remote-first searches are too restrictive here. Only ${remotePct}% of roles are fully remote — Berlin presence is the practical default.`
    )
  } else {
    implications.push(
      `${remotePct}% of roles offer full remote — worth filtering for, but not the dominant mode.`
    )
  }

  // Seniority
  if (senior_pct >= 60) {
    implications.push(
      `Junior candidates will find limited options. ${senior_pct}% of roles are Senior-level or above.`
    )
  } else if (senior_pct >= 40) {
    implications.push(
      `The accessible pool is weighted toward mid-to-senior. Both levels have meaningful representation at ${senior_pct}% Senior+.`
    )
  }

  // AI
  if (ai.n_enriched > 0 && (ai.ai_focus_pct >= 20 || ai.ai_skills_pct >= 20)) {
    const pct = Math.max(ai.ai_focus_pct, ai.ai_skills_pct)
    implications.push(
      `AI exposure is a practical differentiator — ${pct}% of classified roles list it as a focus or requirement.`
    )
  }

  return implications.slice(0, 4)
}

function collapseWorkMode(modes: { label: string; count: number }[]) {
  const counts = { remote: 0, hybrid: 0, onsite: 0, unknown: 0 }
  for (const m of modes) {
    if (m.label === 'remote') counts.remote += m.count
    else if (HYBRID_KEYS.has(m.label)) counts.hybrid += m.count
    else if (m.label === 'onsite') counts.onsite += m.count
    else counts.unknown += m.count
  }
  return [
    { label: 'Remote', count: counts.remote, color: '#22d3ee', drillKey: 'remote' },
    { label: 'Hybrid', count: counts.hybrid, color: '#60a5fa', drillKey: 'hybrid' },
    { label: 'On-site', count: counts.onsite, color: '#fb923c', drillKey: 'onsite' },
    { label: 'Unclassified', count: counts.unknown, color: '#525252', drillKey: 'unknown' },
  ].filter((i) => i.count > 0)
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatChip({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-elevated border border-border">
      <span className="text-sm font-bold text-white tabular-nums">{value}</span>
      <span className="text-xs text-muted">{label}</span>
    </div>
  )
}

// One waffle chart on the page — used in the language/access section only.
// Uses largest-remainder (Hamilton) method for accurate proportional allocation.
function WaffleChart({
  items,
  total,
  onCellClick,
  activeKey,
}: {
  items: { count: number; color: string; drillKey: string; label: string }[]
  total: number
  onCellClick?: (key: string, label: string) => void
  activeKey?: string | null
}) {
  const CELLS = 100

  // Largest-remainder method: floors first, then give extras to highest remainders.
  // Use sum of item counts (not total) so proportions reflect classified data only;
  // unclassified roles render as empty cells via the fill loop below.
  const classifiedSum = items.reduce((a, i) => a + i.count, 0)
  const base = classifiedSum > 0 ? classifiedSum : 1
  const filledCells = total > 0 ? Math.round((classifiedSum / total) * CELLS) : 0
  const exactShares = items.map((i) => (i.count / base) * filledCells)
  const floors = exactShares.map(Math.floor)
  const remainders = exactShares.map((exact, i) => exact - floors[i])
  const remaining = Math.min(
    Math.max(0, filledCells - floors.reduce((a, b) => a + b, 0)),
    items.length,
  )
  const sortedByRemainder = remainders
    .map((r, i) => ({ r, i }))
    .sort((a, b) => b.r - a.r)
  const allocations = [...floors]
  for (let k = 0; k < remaining; k++) {
    allocations[sortedByRemainder[k].i] += 1
  }

  const cells: { color: string; key: string; label: string }[] = []
  items.forEach((item, idx) => {
    for (let j = 0; j < allocations[idx]; j++) {
      cells.push({ color: item.color, key: item.drillKey, label: item.label })
    }
  })
  // Fill any remaining with empty cells (handles edge cases)
  while (cells.length < CELLS) {
    cells.push({ color: 'rgba(255,255,255,0.04)', key: '', label: '' })
  }

  return (
    <div
      className="grid gap-[2px]"
      style={{ gridTemplateColumns: 'repeat(10, 1fr)' }}
    >
      {cells.map((cell, i) => {
        const isActive = cell.key && activeKey === cell.key
        return (
          <div
            key={i}
            onClick={
              cell.key && onCellClick
                ? () => onCellClick(cell.key, cell.label)
                : undefined
            }
            style={{ backgroundColor: cell.color, aspectRatio: '1' }}
            className={[
              'rounded-[2px] transition-all duration-150',
              cell.key && onCellClick ? 'cursor-pointer hover:brightness-125' : '',
              activeKey && cell.key && !isActive ? 'opacity-[0.12]' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          />
        )
      })}
    </div>
  )
}

// Light horizontal summary strip — replaces the 3-card Further Breakdown grid.
function SummaryStrip({
  items,
}: {
  items: {
    label: string
    value: string | number
    descriptor: string
    isActive: boolean
    onClick: () => void
  }[]
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] flex flex-col sm:flex-row sm:divide-x sm:divide-white/[0.06]">
      {items.map((item, i) => (
        <button
          key={i}
          type="button"
          onClick={item.onClick}
          className={[
            'flex-1 text-left px-6 py-5 transition-colors hover:bg-white/[0.025]',
            'first:rounded-t-xl last:rounded-b-xl',
            'sm:first:rounded-l-xl sm:first:rounded-tr-none sm:last:rounded-r-xl sm:last:rounded-bl-none',
            'border-b border-white/[0.06] sm:border-b-0 last:border-b-0',
            item.isActive ? 'bg-white/[0.03]' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <p className="text-2xs text-subtle uppercase tracking-widest mb-3">{item.label}</p>
          <p className="text-[2rem] font-bold text-white tabular-nums leading-none mb-2">
            {item.value}
          </p>
          <p className="text-xs text-muted leading-snug">{item.descriptor}</p>
        </button>
      ))}
    </div>
  )
}

// Compact drill-down support module — lighter treatment than chart cards.
function DrillModule({
  label,
  value,
  insight,
  isActive,
  onClick,
}: {
  label: string
  value: string | number
  insight: string
  isActive: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'text-left w-full rounded-xl border px-4 py-4 transition-all group',
        isActive
          ? 'bg-surface-elevated border-border-strong'
          : 'border-[rgba(255,255,255,0.06)] hover:bg-surface/80 hover:border-border',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <p className="text-2xs text-subtle uppercase tracking-wider leading-none">{label}</p>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden="true"
          className={[
            'shrink-0 transition-colors mt-0.5',
            isActive ? 'text-accent' : 'text-subtle group-hover:text-muted',
          ].join(' ')}
        >
          <path
            d="M2.5 6H9.5M9.5 6L7 3.5M9.5 6L7 8.5"
            stroke="currentColor"
            strokeWidth="1.1"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <p className="text-2xl font-bold text-white tabular-nums leading-none">{value}</p>
      <p className="text-xs text-muted mt-1.5 leading-snug">{insight}</p>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  overview: Overview
  dist: Distributions
}

export default function OverviewClient({ overview, dist }: Props) {
  const [drillTarget, setDrillTarget] = useState<DrillTarget | null>(null)
  const [apiDrillParams, setApiDrillParams] = useState<{
    chart_id: string
    segment_key: string
  } | null>(null)
  const [activeKey, setActiveKey] = useState<string | null>(null)

  const { n_active, senior_pct, accessible_pct } = overview
  const { ai } = dist

  const implications = generateImplications(
    n_active,
    senior_pct,
    accessible_pct,
    overview.location,
    ai,
  )

  function handleDrill(dimension: string, keys: string[], label: string, segKey: string) {
    if (activeKey === segKey) {
      setDrillTarget(null)
      setApiDrillParams(null)
      setActiveKey(null)
      return
    }
    const apiParams = toApiParams(dimension, segKey)
    if (!apiParams) return
    setDrillTarget({ dimension, keys, label })
    setApiDrillParams(apiParams)
    setActiveKey(segKey)
  }

  function handleClose() {
    setDrillTarget(null)
    setApiDrillParams(null)
    setActiveKey(null)
  }

  // ---------------------------------------------------------------------------
  // Chart item builders
  // ---------------------------------------------------------------------------

  const languageItems = [
    { label: 'No German required', count: overview.language.en_none, color: '#4ade80', drillKey: 'en_none' },
    { label: 'German a plus',      count: overview.language.en_plus, color: '#2dd4bf', drillKey: 'en_plus' },
    { label: 'German required',    count: overview.language.en_must, color: '#60a5fa', drillKey: 'en_must' },
    { label: 'German posting',     count: overview.language.de,      color: '#818cf8', drillKey: 'de'      },
  ].filter((i) => i.count > 0)

  const workModeItems = collapseWorkMode(dist.work_mode)

  const pmTypeItems = dist.pm_type.map((item) => ({
    label: PM_TYPE_LABELS[item.label] ?? item.label,
    count: item.count,
    color: PM_TYPE_COLORS[item.label] ?? '#818cf8',
    drillKey: item.label,
  }))

  const seniorityItems = dist.seniority
    .filter((item) => item.label !== 'unknown' && item.count > 0)
    .map((item) => ({
      label: SENIORITY_LABELS[item.label] ?? item.label,
      count: item.count,
      color: SENIORITY_COLORS[item.label] ?? '#818cf8',
      drillKey: item.label,
    }))

  const n_companies = dist.companies.n_companies

  // ---------------------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------------------

  const remoteCount = workModeItems.find((i) => i.drillKey === 'remote')?.count ?? 0
  const remotePct = n_active > 0 ? Math.round((remoteCount / n_active) * 100) : 0

  const SENIOR_PLUS_KEYS = new Set([
    'senior', 'mid_senior', 'lead', 'staff', 'group', 'principal', 'head',
  ])
  const seniorPlusCount = dist.seniority
    .filter((i) => SENIOR_PLUS_KEYS.has(i.label))
    .reduce((acc, i) => acc + i.count, 0)

  // Group seniority: merge lead+ into one row
  const coreSeniorityItems = seniorityItems.filter((i) =>
    ['junior', 'mid', 'mid_senior', 'senior'].includes(i.drillKey ?? '')
  )
  const leadAboveCount = seniorityItems
    .filter((i) => ['lead', 'staff', 'group', 'principal', 'head'].includes(i.drillKey ?? ''))
    .reduce((acc, i) => acc + i.count, 0)
  const groupedSeniorityItems = [
    ...coreSeniorityItems,
    ...(leadAboveCount > 0
      ? [{ label: 'Lead & above', count: leadAboveCount, color: '#a78bfa', drillKey: 'lead' }]
      : []),
  ]

  // Waffle items — same shape as languageItems but required by WaffleChart
  const waffleItems = languageItems.map((i) => ({
    count: i.count,
    color: i.color ?? '#818cf8',
    drillKey: i.drillKey ?? i.label,
    label: i.label,
  }))

  return (
    <>
      {/* ================================================================== */}
      {/* Section A — Hero                                                    */}
      {/* ================================================================== */}
      <div className="pt-6 pb-24 md:pb-36 border-b border-border">
        <div className="grid grid-cols-1 md:grid-cols-[3fr_2fr] gap-10 md:gap-14 items-start">

          {/* Left: dominant editorial block */}
          <div>
            <p className="text-2xs text-subtle uppercase tracking-widest mb-10">
              Berlin · PM Market
            </p>
            <h1 className="text-5xl sm:text-[3.5rem] md:text-[4.25rem] font-bold text-white tracking-tight leading-[1.05] mb-7">
              {generateHeroTitle(senior_pct, accessible_pct, remotePct, n_active)}
            </h1>
            <p className="text-sm text-muted leading-relaxed mb-10 max-w-[26rem]">
              {generateHeroBody(n_active, senior_pct, accessible_pct, remotePct)}
            </p>
            <div className="flex flex-wrap gap-2">
              <StatChip value={n_active} label="active roles" />
              {accessible_pct > 0 && (
                <StatChip value={`${accessible_pct}%`} label="English-accessible" />
              )}
              <StatChip value={`${remotePct}%`} label="fully remote" />
            </div>
          </div>

          {/* Right: negative space — hero left block owns this section */}
          <div />
        </div>
      </div>

      {/* ================================================================== */}
      {/* Section B — Access conditions                                       */}
      {/* ================================================================== */}
      <div className="mt-28">
        <p className="text-2xs text-subtle uppercase tracking-widest mb-8">Access conditions</p>

        {/* Group for sibling-dimming on hover */}
        <div className="group/access grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-6">

          {/* PRIMARY module — language access + waffle */}
          <div className="group-hover/access:opacity-[0.85] hover:!opacity-100 transition-opacity duration-200 bg-surface border border-border rounded-2xl p-8 sm:p-10 hover:border-border-strong hover:shadow-[0_0_32px_rgba(129,140,248,0.09)]">
            <h3 className="text-base font-semibold text-white leading-snug mb-1">
              {accessible_pct >= 50
                ? 'English gets you about half the market'
                : 'German is the main access filter'}
            </h3>
            <p className="text-xs text-muted mb-8 leading-relaxed">
              {accessible_pct >= 50
                ? `${100 - accessible_pct}% of roles list some German requirement.`
                : `Only ${accessible_pct}% of roles list no German requirement.`}
            </p>

            <div className="flex flex-col sm:flex-row sm:items-start gap-6">
              <div className="sm:flex-1">
                <p className="text-2xs text-subtle uppercase tracking-widest mb-4">
                  Share of market
                </p>
                <WaffleChart
                  items={waffleItems}
                  total={n_active}
                  onCellClick={(key, label) => handleDrill('language', [key], label, key)}
                  activeKey={drillTarget?.dimension === 'language' ? activeKey : null}
                />
              </div>
              {/* Legend — segment labels + values */}
              <div className="sm:flex-1 flex flex-col gap-2 sm:pt-7">
                {languageItems.map((item) => (
                  <div key={item.drillKey} className="flex items-center gap-2.5">
                    <span
                      className="w-2.5 h-2.5 rounded-[2px] shrink-0"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-xs text-muted flex-1 leading-none">{item.label}</span>
                    <span className="text-xs text-white/60 tabular-nums font-medium">
                      {item.count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* SECONDARY statement card — work mode / remote */}
          <div className="group-hover/access:opacity-[0.85] hover:!opacity-100 transition-opacity duration-200 bg-surface border border-border rounded-xl p-6 sm:p-7 hover:border-border-strong">
            <h3 className="text-base font-semibold text-white leading-snug mb-1">
              Remote roles are scarce
            </h3>
            <p className="text-xs text-muted mb-5 leading-relaxed">
              On-site and hybrid are the default arrangement.
            </p>
            <div className="mb-6 flex items-baseline gap-2.5">
              <p className="text-4xl font-bold text-white tabular-nums leading-none">{remotePct}%</p>
              <p className="text-xs text-muted">of roles are fully remote</p>
            </div>
            <StatBar
              items={workModeItems}
              showPct
              onBarClick={(key, label) =>
                handleDrill(
                  'work_mode',
                  key === 'hybrid' ? [...HYBRID_KEYS] : [key],
                  label,
                  key,
                )
              }
              activeKey={drillTarget?.dimension === 'work_mode' ? activeKey : null}
            />
          </div>
        </div>
      </div>

      {/* ================================================================== */}
      {/* Section C — Profile fit                                             */}
      {/* ================================================================== */}
      <div className="mt-32">
        <p className="text-2xs text-subtle uppercase tracking-widest mb-8">Profile fit</p>

        {/* Seniority dominant (left, wider) + AI/role focus supporting (right, narrower) */}
        <div className="group/profile grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-6">

          {/* SECONDARY module — seniority distribution (dominant in this section) */}
          {groupedSeniorityItems.length > 0 && (
            <div className="group-hover/profile:opacity-[0.85] hover:!opacity-100 transition-opacity duration-200 bg-surface border border-border rounded-xl p-6 sm:p-7 hover:border-border-strong">
              <h3 className="text-base font-semibold text-white leading-snug mb-1">
                The market skews senior
              </h3>
              <p className="text-xs text-muted mb-5 leading-relaxed">
                {senior_pct >= 50
                  ? `${senior_pct}% of roles are Senior-level or above.`
                  : senior_pct > 0
                  ? `${senior_pct}% Senior or above — mid and senior both represented.`
                  : 'Experience level distribution across active roles.'}
              </p>
              <StatBar
                items={groupedSeniorityItems}
                showPct
                onBarClick={(key, label) => handleDrill('seniority', [key], label, key)}
                activeKey={drillTarget?.dimension === 'seniority' ? activeKey : null}
              />
            </div>
          )}

          {/* LIGHT module — AI expectations or role focus (quieter, statement-style) */}
          <div className="group-hover/profile:opacity-[0.85] hover:!opacity-100 transition-opacity duration-200 bg-surface border border-white/[0.07] rounded-xl p-6 sm:p-7 hover:border-border/60">
            {ai.n_enriched > 0 && ai.ai_focus_pct >= 10 ? (
              <>
                <h3 className="text-base font-semibold text-white leading-snug mb-1">
                  AI is already part of the bar
                </h3>
                <p className="text-xs text-muted mb-10 leading-relaxed">
                  Based on {ai.n_enriched} classified roles.
                </p>
                {(() => {
                  const focusIsPrimary = ai.ai_focus_pct >= ai.ai_skills_pct
                  const primary   = focusIsPrimary ? { pct: ai.ai_focus_pct,  n: ai.n_ai_focus,  label: 'AI as core focus' }  : { pct: ai.ai_skills_pct, n: ai.n_ai_skills, label: 'AI skills required' }
                  const secondary = focusIsPrimary ? { pct: ai.ai_skills_pct, n: ai.n_ai_skills, label: 'AI skills required' } : { pct: ai.ai_focus_pct,  n: ai.n_ai_focus,  label: 'AI as core focus' }
                  return (
                    <div className="flex flex-col gap-8">
                      <div>
                        <p className="text-5xl font-bold text-white tabular-nums leading-none">
                          {primary.pct}%
                        </p>
                        <p className="text-sm text-white/70 font-medium mt-3">{primary.label}</p>
                        <p className="text-xs text-muted mt-1">{primary.n} roles</p>
                      </div>
                      <div className="pt-8 border-t border-white/[0.06]">
                        <p className="text-3xl font-semibold text-white/60 tabular-nums leading-none">
                          {secondary.pct}%
                        </p>
                        <p className="text-sm text-white/40 font-medium mt-2.5">{secondary.label}</p>
                        <p className="text-xs text-subtle mt-1">{secondary.n} roles</p>
                      </div>
                    </div>
                  )
                })()}
              </>
            ) : pmTypeItems.length > 0 ? (
              <>
                <h3 className="text-base font-semibold text-white leading-snug mb-1">
                  {pmTypeItems[0]
                    ? `${pmTypeItems[0].label} leads role demand`
                    : 'PM specialisms in this snapshot'}
                </h3>
                <p className="text-xs text-muted mb-5 leading-relaxed">
                  Role focus distribution across active listings.
                </p>
                <StatBar
                  items={pmTypeItems.slice(0, 5)}
                  showPct
                  onBarClick={(key, label) => handleDrill('pm_type', [key], label, key)}
                  activeKey={drillTarget?.dimension === 'pm_type' ? activeKey : null}
                />
              </>
            ) : null}
          </div>
        </div>
      </div>

      {/* ================================================================== */}
      {/* Section D — Further breakdown / drill-down                          */}
      {/* ================================================================== */}
      <div className="mt-28">
        <p className="text-2xs text-subtle uppercase tracking-widest mb-8">Further breakdown</p>
        <SummaryStrip
          items={[
            {
              label: 'English-accessible roles',
              value: overview.language.en_none,
              descriptor: 'No German requirement listed',
              isActive:
                apiDrillParams?.chart_id === 'german_requirement' &&
                apiDrillParams?.segment_key === 'not_mentioned',
              onClick: () => {
                if (
                  apiDrillParams?.chart_id === 'german_requirement' &&
                  apiDrillParams?.segment_key === 'not_mentioned'
                ) {
                  handleClose()
                } else {
                  setDrillTarget({ dimension: 'language', keys: ['en_none'], label: 'English-accessible roles' })
                  setApiDrillParams({ chart_id: 'german_requirement', segment_key: 'not_mentioned' })
                  setActiveKey('en_none')
                }
              },
            },
            {
              label: 'Senior+ roles',
              value: seniorPlusCount,
              descriptor: `Senior, Lead, Staff & above${senior_pct > 0 ? ` · ${senior_pct}% of market` : ''}`,
              isActive:
                apiDrillParams?.chart_id === 'seniority' &&
                apiDrillParams?.segment_key === 'senior',
              onClick: () => {
                if (
                  apiDrillParams?.chart_id === 'seniority' &&
                  apiDrillParams?.segment_key === 'senior'
                ) {
                  handleClose()
                } else {
                  setDrillTarget({ dimension: 'seniority', keys: ['senior'], label: 'Senior+ roles' })
                  setApiDrillParams({ chart_id: 'seniority', segment_key: 'senior' })
                  setActiveKey('senior')
                }
              },
            },
            {
              label: 'Companies hiring now',
              value: n_companies,
              descriptor: `${n_active} open roles total`,
              isActive:
                apiDrillParams?.chart_id === 'location' &&
                apiDrillParams?.segment_key === 'berlin',
              onClick: () => {
                if (
                  apiDrillParams?.chart_id === 'location' &&
                  apiDrillParams?.segment_key === 'berlin'
                ) {
                  handleClose()
                } else {
                  setDrillTarget({ dimension: 'location', keys: ['berlin'], label: 'Companies hiring now' })
                  setApiDrillParams({ chart_id: 'location', segment_key: 'berlin' })
                  setActiveKey('berlin')
                }
              },
            },
          ]}
        />
      </div>

      {/* ================================================================== */}
      {/* What this means                                                     */}
      {/* ================================================================== */}
      {implications.length > 0 && (
        <section className="mt-40 pt-24 border-t border-border">
          <p className="text-2xs text-subtle uppercase tracking-widest mb-8">What this means</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-14 gap-y-6 max-w-3xl">
            {implications.map((text, i) => (
              <div key={i} className="flex gap-3 items-start">
                <span className="w-1 h-1 rounded-full bg-accent shrink-0 mt-[0.45rem]" />
                <p className="text-sm text-white/75 leading-relaxed">{text}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ================================================================== */}
      {/* Empty state                                                         */}
      {/* ================================================================== */}
      {n_active === 0 && (
        <div className="mt-16 bg-surface border border-border rounded-xl p-10 text-center">
          <p className="text-muted text-sm">
            No data available yet. The pipeline runs daily — check back tomorrow.
          </p>
        </div>
      )}

      {/* ================================================================== */}
      {/* Drill-down panel                                                    */}
      {/* ================================================================== */}
      <DrillDownPanel
        target={drillTarget}
        apiParams={apiDrillParams}
        filters={DEFAULT_FILTERS}
        onClose={handleClose}
      />
    </>
  )
}
