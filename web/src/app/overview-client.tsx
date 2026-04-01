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

function getMarketCharacter(senior_pct: number, accessible_pct: number, n_active: number): string {
  if (n_active === 0) return 'No active roles in the current snapshot.'
  const seniority =
    senior_pct >= 60 ? 'senior-heavy' : senior_pct >= 40 ? 'mid-to-senior' : 'balanced'
  const access =
    accessible_pct >= 50
      ? 'broadly accessible'
      : accessible_pct >= 30
      ? 'moderately accessible'
      : 'language-constrained'
  return `A ${seniority}, ${access} market.`
}

function generateInsights(
  n_active: number,
  senior_pct: number,
  accessible_pct: number,
  location: Overview['location'],
  ai: Distributions['ai'],
  language: Overview['language'],
): string[] {
  const insights: string[] = []

  if (senior_pct >= 60) {
    insights.push(
      `${senior_pct}% of classified roles are Senior or above. The market is skewed toward experienced candidates, with limited mid-level and entry-level openings in this snapshot.`
    )
  } else if (senior_pct > 0) {
    insights.push(
      `Seniority is broadly distributed — ${senior_pct}% Senior+, with meaningful mid-level representation in this snapshot.`
    )
  }

  if (accessible_pct >= 40) {
    insights.push(
      `${accessible_pct}% of active roles list no German requirement. This represents the widest accessible segment for English-speaking candidates.`
    )
  } else if (accessible_pct > 0) {
    insights.push(
      `Only ${accessible_pct}% of active roles list no German requirement. German fluency expands market access considerably in this snapshot.`
    )
  }

  if (ai.n_enriched > 0 && ai.ai_focus_pct >= 20) {
    insights.push(
      `Among ${ai.n_enriched} classified roles, ${ai.ai_focus_pct}% list AI as a core focus area — a directional signal that AI product experience is increasingly expected.`
    )
  }

  const remotePct = n_active > 0 ? Math.round((location.remote_germany / n_active) * 100) : 0
  if (remotePct >= 10 && insights.length < 3) {
    insights.push(
      `${remotePct}% of roles are explicitly remote-friendly — a notable share for a primarily Berlin-based search.`
    )
  }

  if (language.de > language.en_none + language.en_plus + language.en_must && insights.length < 3) {
    insights.push(
      `German-language postings account for the majority of active roles in this snapshot. German-source coverage is important for full market visibility.`
    )
  }

  return insights.slice(0, 3)
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
// Inline sub-components
// ---------------------------------------------------------------------------

function StatChip({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-elevated border border-border">
      <span className="text-sm font-bold text-white tabular-nums">{value}</span>
      <span className="text-xs text-muted">{label}</span>
    </div>
  )
}

const HERO_LANG_SHORT: Record<string, string> = {
  en_none: 'No German',
  en_plus: 'German +',
  en_must: 'Required',
  de: 'German-only',
}

function HeroAccessBar({
  items,
  total,
  onSegmentClick,
  activeKey,
}: {
  items: { label: string; count: number; color?: string; drillKey?: string }[]
  total?: number
  onSegmentClick?: (key: string, label: string) => void
  activeKey?: string | null
}) {
  const sum = total ?? items.reduce((acc, i) => acc + i.count, 0)
  const visibleItems = items.filter((i) => sum > 0 && i.count > 0)

  return (
    <div>
      {/* Tall segmented bar */}
      <div className="flex h-8 rounded-lg overflow-hidden gap-0.5 mb-4">
        {visibleItems.map((item) => {
          const pct = (item.count / sum) * 100
          const key = item.drillKey ?? item.label
          const isActive = activeKey === key
          return (
            <div
              key={key}
              onClick={onSegmentClick ? () => onSegmentClick(key, item.label) : undefined}
              style={{ width: `${pct}%`, backgroundColor: item.color ?? '#818cf8' }}
              className={[
                'transition-opacity',
                onSegmentClick ? 'cursor-pointer' : '',
                activeKey && !isActive ? 'opacity-20' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            />
          )
        })}
      </div>
      {/* Labels row — always visible */}
      <div
        className="grid gap-x-3 gap-y-1"
        style={{ gridTemplateColumns: `repeat(${visibleItems.length}, 1fr)` }}
      >
        {visibleItems.map((item) => {
          const pct = Math.round((item.count / sum) * 100)
          const key = item.drillKey ?? item.label
          const isActive = activeKey === key
          return (
            <div
              key={key}
              onClick={onSegmentClick ? () => onSegmentClick(key, item.label) : undefined}
              className={[
                onSegmentClick ? 'cursor-pointer' : '',
                activeKey && !isActive ? 'opacity-30' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <div
                className="w-2 h-2 rounded-full mb-1.5"
                style={{ backgroundColor: item.color ?? '#818cf8' }}
              />
              <p className="text-sm font-bold text-white tabular-nums leading-none">{pct}%</p>
              <p className="text-2xs text-muted mt-0.5 leading-tight">
                {HERO_LANG_SHORT[key] ?? item.label}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

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
        'text-left w-full rounded-xl border p-5 transition-colors group',
        isActive
          ? 'bg-surface-elevated border-border-strong'
          : 'bg-surface border-border hover:bg-surface-elevated hover:border-border-strong',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-2xs text-muted uppercase tracking-wider leading-none">{label}</p>
          <p className="text-2xl font-bold text-white tabular-nums leading-none mt-2.5">{value}</p>
          <p className="text-xs text-muted mt-2 leading-snug">{insight}</p>
        </div>
        <div
          className={[
            'shrink-0 w-6 h-6 rounded-full border flex items-center justify-center mt-0.5 transition-colors',
            isActive
              ? 'border-accent text-accent bg-accent/10'
              : 'border-border text-subtle group-hover:border-border-strong group-hover:text-muted',
          ].join(' ')}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
            <path
              d="M2 5H8M8 5L5.5 2.5M8 5L5.5 7.5"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>
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
  const [apiDrillParams, setApiDrillParams] = useState<{ chart_id: string; segment_key: string } | null>(null)
  const [activeKey, setActiveKey] = useState<string | null>(null)

  const { n_active, senior_pct, accessible_pct } = overview
  const { ai } = dist

  const insights = generateInsights(
    n_active,
    senior_pct,
    accessible_pct,
    overview.location,
    ai,
    overview.language,
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

  const SENIOR_PLUS_KEYS = new Set(['senior', 'mid_senior', 'lead', 'staff', 'group', 'principal', 'head'])
  const seniorPlusCount = dist.seniority
    .filter((i) => SENIOR_PLUS_KEYS.has(i.label))
    .reduce((acc, i) => acc + i.count, 0)

  // Group seniority: keep core levels, merge lead+ into one row to reduce noise
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

  return (
    <>
      {/* ------------------------------------------------------------------ */}
      {/* Section A — Hero                                                    */}
      {/* ------------------------------------------------------------------ */}
      <div className="pt-2 pb-16 border-b border-border">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-10 items-start">

          {/* Left: editorial text + stat chips */}
          <div>
            <p className="text-2xs text-subtle uppercase tracking-widest mb-5">
              Berlin · PM Market
            </p>
            <h1 className="text-3xl font-bold text-white tracking-tight leading-tight mb-4">
              {getMarketCharacter(senior_pct, accessible_pct, n_active)}
            </h1>
            <p className="text-sm text-muted leading-relaxed mb-6">
              {n_active > 0 ? (
                <>
                  {n_active} roles tracked across Berlin and remote Germany.
                  {senior_pct >= 50
                    ? ` ${senior_pct}% are Senior-level or above.`
                    : senior_pct > 0
                    ? ` Seniority is mixed — ${senior_pct}% Senior or above.`
                    : ''}
                  {remotePct <= 10
                    ? ` Remote is scarce — only ${remotePct}% of roles offer it.`
                    : ` ${remotePct}% offer remote flexibility.`}
                </>
              ) : (
                'No active roles in the current snapshot.'
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              <StatChip value={n_active} label="active roles" />
              {accessible_pct > 0 && (
                <StatChip value={`${accessible_pct}%`} label="English-accessible" />
              )}
              <StatChip value={`${remotePct}%`} label="fully remote" />
            </div>
          </div>

          {/* Right: hero access bar */}
          <div className="bg-surface border border-border rounded-xl p-5 sm:p-6">
            <p className="text-2xs text-subtle uppercase tracking-widest mb-2">Market access</p>
            <h2 className="text-[15px] font-semibold text-white leading-snug mb-1">
              Language is the main access filter
            </h2>
            <p className="text-xs text-muted mb-5 leading-relaxed">
              {accessible_pct}% of postings list no German requirement — the most accessible segment.
            </p>
            <HeroAccessBar
              items={languageItems}
              total={n_active}
              onSegmentClick={(key, label) => handleDrill('language', [key], label, key)}
              activeKey={drillTarget?.dimension === 'language' ? activeKey : null}
            />
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Section B — Access conditions                                       */}
      {/* ------------------------------------------------------------------ */}
      <div className="mt-16">
        <p className="text-2xs text-subtle uppercase tracking-widest mb-6">Access conditions</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">

          {/* Card 1: Language access */}
          <div className="bg-surface border border-border rounded-xl p-5 sm:p-6">
            <h3 className="text-[15px] font-semibold text-white leading-snug mb-1">
              {accessible_pct >= 50
                ? 'About half the market is accessible in English'
                : 'Most of this market requires German'}
            </h3>
            <p className="text-xs text-muted mb-5 leading-relaxed">
              Language requirements determine who can realistically apply.
            </p>
            <StackedBar
              items={languageItems}
              onSegmentClick={(key, label) => handleDrill('language', [key], label, key)}
              activeKey={drillTarget?.dimension === 'language' ? activeKey : null}
            />
          </div>

          {/* Card 2: Work style / remote */}
          <div className="bg-surface border border-border rounded-xl p-5 sm:p-6">
            <h3 className="text-[15px] font-semibold text-white leading-snug mb-1">
              Remote is the exception, not the norm
            </h3>
            <p className="text-xs text-muted mb-4 leading-relaxed">
              On-site and hybrid arrangements dominate this market.
            </p>
            <div className="mb-5 flex items-baseline gap-2.5">
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

      {/* ------------------------------------------------------------------ */}
      {/* Section C — Profile fit                                             */}
      {/* ------------------------------------------------------------------ */}
      <div className="mt-16">
        <p className="text-2xs text-subtle uppercase tracking-widest mb-6">Profile fit</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">

          {/* Card 1: Seniority */}
          {groupedSeniorityItems.length > 0 && (
            <div className="bg-surface border border-border rounded-xl p-5 sm:p-6">
              <h3 className="text-[15px] font-semibold text-white leading-snug mb-1">
                Most roles target experienced PMs
              </h3>
              <p className="text-xs text-muted mb-5 leading-relaxed">
                {senior_pct >= 50
                  ? `${senior_pct}% are Senior-level or above — junior and mid roles are limited.`
                  : senior_pct > 0
                  ? `Seniority is distributed — ${senior_pct}% Senior or above.`
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

          {/* Card 2: Role focus */}
          <div className="bg-surface border border-border rounded-xl p-5 sm:p-6">
            {ai.n_enriched > 0 && ai.ai_focus_pct >= 10 ? (
              <>
                <h3 className="text-[15px] font-semibold text-white leading-snug mb-1">
                  AI experience is increasingly expected
                </h3>
                <p className="text-xs text-muted mb-5 leading-relaxed">
                  Based on {ai.n_enriched} classified roles.
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-3xl font-bold text-white tabular-nums leading-none">
                      {ai.ai_focus_pct}%
                    </p>
                    <p className="text-sm text-white/70 font-medium mt-1.5">AI as core focus</p>
                    <p className="text-xs text-muted mt-0.5">{ai.n_ai_focus} roles</p>
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-white tabular-nums leading-none">
                      {ai.ai_skills_pct}%
                    </p>
                    <p className="text-sm text-white/70 font-medium mt-1.5">AI skills required</p>
                    <p className="text-xs text-muted mt-0.5">{ai.n_ai_skills} roles</p>
                  </div>
                </div>
              </>
            ) : pmTypeItems.length > 0 ? (
              <>
                <h3 className="text-[15px] font-semibold text-white leading-snug mb-1">
                  What type of PM work is in demand
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

      {/* ------------------------------------------------------------------ */}
      {/* Section D — Drill-down entry points                                */}
      {/* ------------------------------------------------------------------ */}
      <div className="mt-16">
        <p className="text-2xs text-subtle uppercase tracking-widest mb-6">Explore further</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

          <DrillModule
            label="English-accessible roles"
            value={overview.language.en_none}
            insight="No German requirement listed"
            isActive={
              apiDrillParams?.chart_id === 'german_requirement' &&
              apiDrillParams?.segment_key === 'not_mentioned'
            }
            onClick={() => {
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
            }}
          />

          <DrillModule
            label="Senior+ roles"
            value={seniorPlusCount}
            insight={`Senior, Lead, Staff & above${senior_pct > 0 ? ` · ${senior_pct}% of market` : ''}`}
            isActive={
              apiDrillParams?.chart_id === 'seniority' &&
              apiDrillParams?.segment_key === 'senior'
            }
            onClick={() => {
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
            }}
          />

          <DrillModule
            label="Companies hiring now"
            value={n_companies}
            insight={`${n_active} open roles total`}
            isActive={
              apiDrillParams?.chart_id === 'location' &&
              apiDrillParams?.segment_key === 'berlin'
            }
            onClick={() => {
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
            }}
          />
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Analyst notes                                                       */}
      {/* ------------------------------------------------------------------ */}
      {insights.length > 0 && (
        <section className="mt-20 pt-16 border-t border-border">
          <p className="text-2xs text-subtle uppercase tracking-widest mb-6">Analyst notes</p>
          <div>
            {insights.map((text, i) => (
              <div
                key={i}
                className="flex gap-8 py-5 border-b border-border last:border-b-0"
              >
                <span className="text-2xs text-subtle font-mono tabular-nums leading-none mt-0.5 w-5 shrink-0">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <p className="text-sm text-white/80 leading-relaxed">{text}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Empty state                                                         */}
      {/* ------------------------------------------------------------------ */}
      {n_active === 0 && (
        <div className="mt-16 bg-surface border border-border rounded-xl p-10 text-center">
          <p className="text-muted text-sm">
            No data available yet. The pipeline runs daily — check back tomorrow.
          </p>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Drill-down panel                                                    */}
      {/* ------------------------------------------------------------------ */}
      <DrillDownPanel
        target={drillTarget}
        apiParams={apiDrillParams}
        filters={DEFAULT_FILTERS}
        onClose={handleClose}
      />
    </>
  )
}
