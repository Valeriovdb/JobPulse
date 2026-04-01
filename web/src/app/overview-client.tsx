'use client'

import { useState, useMemo } from 'react'
import type { Overview, Distributions, Job } from '@/types/data'
import { Section, Card } from '@/components/section'
import { StatBar, StackedBar } from '@/components/stat-bar'
import { FilterBar, DEFAULT_FILTERS, type FilterState } from '@/components/filter-bar'
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

const SENIOR_LEVELS = new Set(['senior', 'mid_senior', 'lead', 'staff', 'group', 'principal', 'head'])
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
// Filter logic (client-side, for chart distribution recalculation)
// ---------------------------------------------------------------------------

function applyFilters(jobs: Job[], filters: FilterState): Job[] {
  let result = jobs

  if (filters.time !== 'all') {
    const days = filters.time === '7d' ? 7 : 30
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)
    result = result.filter((j) => j.first_seen_date && new Date(j.first_seen_date) >= cutoff)
  }

  if (filters.location !== 'all') {
    if (filters.location === 'berlin') result = result.filter((j) => j.location === 'berlin')
    else result = result.filter((j) => j.location === 'remote_germany')
  }

  if (filters.seniority !== 'all') {
    const map: Record<string, string[]> = {
      junior: ['junior'],
      mid: ['mid'],
      senior: ['senior', 'mid_senior'],
      lead: ['lead', 'staff', 'group', 'principal', 'head'],
    }
    const targets = new Set(map[filters.seniority] ?? [])
    result = result.filter((j) => targets.has(j.seniority))
  }

  if (filters.language !== 'all') {
    if (filters.language === 'en_only')     result = result.filter((j) => j.language === 'en' && j.german_req === 'not_mentioned')
    else if (filters.language === 'en_plus')result = result.filter((j) => j.german_req === 'plus')
    else                                    result = result.filter((j) => j.german_req === 'must' || j.language === 'de')
  }

  return result
}

function deriveStats(jobs: Job[], overview: Overview, dist: Distributions) {
  if (!jobs.length) {
    return {
      n_active: overview.n_active,
      n_new_week: overview.n_new_week,
      senior_pct: overview.senior_pct,
      accessible_pct: overview.accessible_pct,
      n_companies: dist.companies.n_companies,
      language: overview.language,
      location: overview.location,
    }
  }

  const n_active = jobs.length
  const n_senior = jobs.filter((j) => SENIOR_LEVELS.has(j.seniority)).length
  const senior_pct = n_active ? Math.round((n_senior / n_active) * 100) : 0

  const en_none = jobs.filter((j) => j.language === 'en' && j.german_req === 'not_mentioned').length
  const en_plus = jobs.filter((j) => j.german_req === 'plus').length
  const en_must = jobs.filter((j) => j.language === 'en' && j.german_req === 'must').length
  const de     = jobs.filter((j) => j.language === 'de').length
  const accessible_pct = n_active ? Math.round((en_none / n_active) * 100) : 0

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const n_new_week = jobs.filter((j) => j.first_seen_date && new Date(j.first_seen_date) >= weekAgo).length

  const n_companies = new Set(jobs.map((j) => j.company).filter(Boolean)).size
  const n_berlin    = jobs.filter((j) => j.location === 'berlin').length
  const n_remote    = jobs.filter((j) => j.location === 'remote_germany').length

  return {
    n_active,
    n_new_week,
    senior_pct,
    accessible_pct,
    n_companies,
    language: { en_none, en_plus, en_must, de },
    location: { berlin: n_berlin, remote_germany: n_remote, unclear: Math.max(n_active - n_berlin - n_remote, 0) },
  }
}

function deriveDist(jobs: Job[], baseDist: Distributions): Distributions {
  if (!jobs.length) return baseDist

  const wm: Record<string, number> = {}
  const pm: Record<string, number> = {}
  let n_enriched = 0, n_ai_focus = 0, n_ai_skills = 0

  for (const j of jobs) {
    const wmKey = HYBRID_KEYS.has(j.work_mode) ? 'hybrid' : j.work_mode
    wm[wmKey] = (wm[wmKey] || 0) + 1

    if (j.pm_type) {
      pm[j.pm_type] = (pm[j.pm_type] || 0) + 1
      n_enriched++
    }
    if (j.ai_focus) n_ai_focus++
    if (j.ai_skills) n_ai_skills++
  }

  return {
    ...baseDist,
    work_mode: Object.entries(wm).map(([label, count]) => ({ label, count })),
    pm_type: Object.entries(pm).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
    ai: {
      n_enriched,
      n_ai_focus,
      n_ai_skills,
      ai_focus_pct: n_enriched ? Math.round((n_ai_focus / n_enriched) * 100) : 0,
      ai_skills_pct: n_enriched ? Math.round((n_ai_skills / n_enriched) * 100) : 0,
    },
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  overview: Overview
  dist: Distributions
  jobs: Job[]
}

export default function OverviewClient({ overview, dist, jobs }: Props) {
  const hasJobData = jobs.length > 0

  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS)
  const [drillTarget, setDrillTarget] = useState<DrillTarget | null>(null)
  const [apiDrillParams, setApiDrillParams] = useState<{ chart_id: string; segment_key: string } | null>(null)
  const [activeKey, setActiveKey] = useState<string | null>(null)

  const filteredJobs = useMemo(
    () => (hasJobData ? applyFilters(jobs, filters) : jobs),
    [jobs, filters, hasJobData]
  )

  const stats = useMemo(
    () => deriveStats(filteredJobs, overview, dist),
    [filteredJobs, overview, dist]
  )

  const activeDist = useMemo(
    () => deriveDist(filteredJobs, dist),
    [filteredJobs, dist]
  )

  const insights = generateInsights(
    stats.n_active,
    stats.senior_pct,
    stats.accessible_pct,
    stats.location,
    activeDist.ai,
    stats.language,
  )

  function handleDrill(dimension: string, keys: string[], label: string, segKey: string) {
    // Toggle off if already active
    if (activeKey === segKey) {
      setDrillTarget(null)
      setApiDrillParams(null)
      setActiveKey(null)
      return
    }
    // Only open panel for API-enabled charts
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
    { label: 'No German required', count: stats.language.en_none, color: '#4ade80', drillKey: 'en_none' },
    { label: 'German a plus',      count: stats.language.en_plus, color: '#2dd4bf', drillKey: 'en_plus' },
    { label: 'German required',    count: stats.language.en_must, color: '#60a5fa', drillKey: 'en_must' },
    { label: 'German posting',     count: stats.language.de,      color: '#818cf8', drillKey: 'de'      },
  ].filter((i) => i.count > 0)

  const locationItems = [
    { label: 'Berlin',            count: stats.location.berlin,           color: '#818cf8', drillKey: 'berlin'          },
    { label: 'Remote Germany',    count: stats.location.remote_germany,   color: '#60a5fa', drillKey: 'remote_germany'  },
    { label: 'Location unclear',  count: stats.location.unclear,          color: '#fb923c', drillKey: 'unclear'         },
  ].filter((i) => i.count > 0)

  const workModeItems = collapseWorkMode(activeDist.work_mode)

  const pmTypeItems = activeDist.pm_type.map((item) => ({
    label: PM_TYPE_LABELS[item.label] ?? item.label,
    count: item.count,
    color: PM_TYPE_COLORS[item.label] ?? '#818cf8',
    drillKey: item.label,
  }))

  const industryItems = dist.industry.slice(0, 8).map((item, i) => ({
    label: item.label,
    count: item.count,
    color: ['#818cf8','#60a5fa','#2dd4bf','#4ade80','#fb923c','#f472b6','#a78bfa','#34d399'][i % 8],
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

  const { n_active, n_new_week, senior_pct, accessible_pct, n_companies } = stats
  const { ai } = activeDist
  const classifiedLocation = stats.location.berlin + stats.location.remote_germany

  const kpis = [
    { value: n_active,      label: 'Active roles' },
    n_new_week > 0 && n_new_week !== n_active ? { value: n_new_week, label: 'New this week' } : null,
    n_companies > 0 ? { value: n_companies, label: 'Companies' } : null,
    overview.median_age_days > 0 ? { value: `${overview.median_age_days}d`, label: 'Median age' } : null,
  ].filter(Boolean) as { value: string | number; label: string }[]

  return (
    <>
      {/* Filters */}
      {hasJobData && (
        <FilterBar filters={filters} onChange={setFilters} />
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Hero                                                                */}
      {/* ------------------------------------------------------------------ */}
      <div className="pt-2 pb-14 border-b border-border">
        <p className="text-2xs text-subtle uppercase tracking-widest mb-8">
          Berlin · PM Market
        </p>

        <h1 className="text-3xl font-bold text-white tracking-tight leading-tight mb-3">
          {getMarketCharacter(senior_pct, accessible_pct, n_active)}
        </h1>

        <p className="text-sm text-muted max-w-lg leading-relaxed mb-8">
          {n_active} active roles in Berlin and remote Germany.
          {senior_pct > 0 && <> {senior_pct}% are Senior level or above.</>}
          {accessible_pct > 0 && <> {accessible_pct}% list no German requirement.</>}
        </p>

        <div className="flex flex-wrap gap-2 mb-10">
          {senior_pct >= 50 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface border border-border text-xs text-white/80">
              Senior-heavy
            </span>
          )}
          {accessible_pct > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface border border-border text-xs text-white/80">
              {accessible_pct}% English-accessible
            </span>
          )}
          {n_companies > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface border border-border text-xs text-white/80">
              {n_companies} companies hiring
            </span>
          )}
        </div>

        <div className="flex items-start">
          {kpis.map((metric, i) => (
            <div
              key={i}
              className={`flex-1 min-w-0 ${i > 0 ? 'pl-8 border-l border-border' : 'pr-8'}`}
            >
              <p className="text-2xl font-bold text-white tracking-tight tabular-nums leading-none">
                {metric.value}
              </p>
              <p className="text-2xs text-subtle uppercase tracking-wider mt-2">
                {metric.label}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Language access                                                     */}
      {/* ------------------------------------------------------------------ */}
      <Section
        title="Language access"
        description="Language requirements shape access to the market."
      >
        <Card>
          <StackedBar
            items={languageItems}
            onSegmentClick={(key, label) => handleDrill('language', [key], label, key)}
            activeKey={drillTarget?.dimension === 'language' ? activeKey : null}
          />
        </Card>
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* Location + Work style                                               */}
      {/* ------------------------------------------------------------------ */}
      <div className="mt-14 grid grid-cols-2 gap-6">
        <div>
          <p className="text-2xs text-subtle uppercase tracking-widest mb-2">Location</p>
          <p className="text-sm text-white font-medium leading-relaxed mb-3">
            {classifiedLocation > 0 && n_active > 0
              ? `${Math.round((classifiedLocation / n_active) * 100)}% of roles are explicitly placed.`
              : 'Where roles are based.'}
          </p>
          <Card>
            <StackedBar
              items={locationItems}
              onSegmentClick={(key, label) => handleDrill('location', [key], label, key)}
              activeKey={drillTarget?.dimension === 'location' ? activeKey : null}
            />
          </Card>
        </div>
        <div>
          <p className="text-2xs text-subtle uppercase tracking-widest mb-2">Work style</p>
          <p className="text-sm text-white font-medium leading-relaxed mb-3">
            Flexibility and on-site requirements.
          </p>
          <Card>
            <StackedBar
              items={workModeItems}
              onSegmentClick={(key, label) => handleDrill('work_mode', key === 'hybrid' ? [...HYBRID_KEYS] : [key], label, key)}
              activeKey={drillTarget?.dimension === 'work_mode' ? activeKey : null}
            />
          </Card>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Seniority                                                           */}
      {/* ------------------------------------------------------------------ */}
      {seniorityItems.length > 0 && (
        <Section title="Seniority" description="Experience level distribution across active roles.">
          <Card>
            <StatBar
              items={seniorityItems}
              showPct
              onBarClick={(key, label) => handleDrill('seniority', [key], label, key)}
              activeKey={drillTarget?.dimension === 'seniority' ? activeKey : null}
            />
          </Card>
        </Section>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Role type                                                           */}
      {/* ------------------------------------------------------------------ */}
      {pmTypeItems.length > 0 && (
        <Section title="Role type" description="What kind of PM work is in demand right now.">
          <Card>
            <StatBar
              items={pmTypeItems}
              showPct
              onBarClick={(key, label) => handleDrill('pm_type', [key], label, key)}
              activeKey={drillTarget?.dimension === 'pm_type' ? activeKey : null}
            />
          </Card>
        </Section>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* AI requirement                                                      */}
      {/* ------------------------------------------------------------------ */}
      {ai.n_enriched > 0 && (
        <Section
          title="AI requirement"
          description={`Based on ${ai.n_enriched} classified roles.`}
        >
          <div className="grid grid-cols-2 gap-3">
            <div
              className="bg-surface border border-border rounded-xl p-5"
            >
              <p className="text-3xl font-bold text-white tabular-nums">{ai.ai_focus_pct}%</p>
              <p className="text-sm text-white/90 font-medium mt-1.5">AI as core focus</p>
              <p className="text-xs text-muted mt-1 leading-snug">
                Product development or AI features as the primary responsibility.
              </p>
              <p className="text-2xs text-subtle mt-2">{ai.n_ai_focus} roles</p>
            </div>
            <div
              className="bg-surface border border-border rounded-xl p-5"
            >
              <p className="text-3xl font-bold text-white tabular-nums">{ai.ai_skills_pct}%</p>
              <p className="text-sm text-white/90 font-medium mt-1.5">AI skills required</p>
              <p className="text-xs text-muted mt-1 leading-snug">
                AI tools, prompting, or ML familiarity listed as a requirement.
              </p>
              <p className="text-2xs text-subtle mt-2">{ai.n_ai_skills} roles</p>
            </div>
          </div>
        </Section>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Industry                                                            */}
      {/* ------------------------------------------------------------------ */}
      {industryItems.length > 0 && (
        <Section title="Industry" description="Where PM roles are concentrating.">
          <Card>
            <StatBar
              items={industryItems}
              showPct
              onBarClick={(key, label) => handleDrill('industry', [key], label, key)}
              activeKey={drillTarget?.dimension === 'industry' ? activeKey : null}
            />
          </Card>
        </Section>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Analyst notes                                                       */}
      {/* ------------------------------------------------------------------ */}
      {insights.length > 0 && (
        <section className="mt-16 pt-14 border-t border-border">
          <p className="text-2xs text-subtle uppercase tracking-widest mb-6">Analyst notes</p>
          <div>
            {insights.map((text, i) => (
              <div
                key={i}
                className="flex gap-6 py-5 border-b border-border last:border-b-0"
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
        filters={filters}
        onClose={handleClose}
      />
    </>
  )
}
