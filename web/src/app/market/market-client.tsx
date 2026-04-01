'use client'

import { useState, useMemo } from 'react'
import type { Overview, Distributions, ExperienceData, Job, ExperienceTag } from '@/types/data'
import { Section, Card, EmptyState, BlockHeading } from '@/components/section'
import { StatBar, StackedBar } from '@/components/stat-bar'
import { FilterBar, DEFAULT_FILTERS, type FilterState } from '@/components/filter-bar'
import { ExperienceChart } from '@/components/experience-chart'

// ---------------------------------------------------------------------------
// Color / label maps (preserved from server page)
// ---------------------------------------------------------------------------

const SENIORITY_COLORS: Record<string, string> = {
  junior: '#4ade80',
  mid: '#60a5fa',
  mid_senior: '#818cf8',
  senior: '#818cf8',
  lead: '#a78bfa',
  staff: '#f472b6',
  principal: '#fb923c',
  head: '#ef4444',
  unknown: '#404040',
}

const WORK_MODE_ORDER = ['remote', 'hybrid_1d', 'hybrid_2d', 'hybrid_3d', 'hybrid_4d', 'hybrid', 'onsite', 'unknown']

const WORK_MODE_LABELS: Record<string, string> = {
  remote:    'Remote',
  hybrid_1d: 'Hybrid · 1d',
  hybrid_2d: 'Hybrid · 2d',
  hybrid_3d: 'Hybrid · 3d',
  hybrid_4d: 'Hybrid · 4d',
  hybrid:    'Hybrid (General)',
  onsite:    'On-site',
  unknown:   'Unclassified',
}

const WORK_MODE_COLORS: Record<string, string> = {
  remote:    '#22d3ee',
  hybrid_1d: '#60a5fa',
  hybrid_2d: '#818cf8',
  hybrid_3d: '#a78bfa',
  hybrid_4d: '#c084fc',
  hybrid:    '#737373',
  onsite:    '#fb923c',
  unknown:   '#404040',
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
  unclassified: '#404040',
  unknown: '#404040',
}

const HYBRID_KEYS = new Set(['hybrid', 'hybrid_1d', 'hybrid_2d', 'hybrid_3d', 'hybrid_4d'])

// ---------------------------------------------------------------------------
// Filter logic
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

function deriveDist(jobs: Job[]): Partial<Distributions> {
  const wm: Record<string, number> = {}
  const pm: Record<string, number> = {}
  const sen: Record<string, number> = {}
  const ind: Record<string, number> = {}
  let n_enriched = 0, n_ai_focus = 0, n_ai_skills = 0
  const en_none_count = { v: 0 }, en_plus_count = { v: 0 }, en_must_count = { v: 0 }, de_count = { v: 0 }
  const ger: Record<string, number> = {}
  const lang: Record<string, number> = {}

  for (const j of jobs) {
    // work mode — keep exact key for full breakdown
    const wmKey = j.work_mode || 'unknown'
    wm[wmKey] = (wm[wmKey] || 0) + 1

    // seniority
    sen[j.seniority || 'unknown'] = (sen[j.seniority || 'unknown'] || 0) + 1

    // pm type
    if (j.pm_type) {
      pm[j.pm_type] = (pm[j.pm_type] || 0) + 1
      n_enriched++
    }

    // ai
    if (j.ai_focus) n_ai_focus++
    if (j.ai_skills) n_ai_skills++

    // industry
    if (j.industry) ind[j.industry] = (ind[j.industry] || 0) + 1

    // language / german req
    lang[j.language || 'unknown'] = (lang[j.language || 'unknown'] || 0) + 1
    ger[j.german_req || 'unclassified'] = (ger[j.german_req || 'unclassified'] || 0) + 1

    // derived language access counts
    if (j.language === 'en' && j.german_req === 'not_mentioned') en_none_count.v++
    else if (j.german_req === 'plus') en_plus_count.v++
    else if (j.language === 'en' && j.german_req === 'must') en_must_count.v++
    else if (j.language === 'de') de_count.v++
  }

  return {
    seniority: Object.entries(sen).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
    work_mode: Object.entries(wm).map(([label, count]) => ({ label, count })),
    pm_type: Object.entries(pm).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
    industry: Object.entries(ind).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
    language: Object.entries(lang).map(([label, count]) => ({ label, count })),
    german_requirement: Object.entries(ger).map(([label, count]) => ({ label, count })),
    ai: {
      n_enriched,
      n_ai_focus,
      n_ai_skills,
      ai_focus_pct: n_enriched ? Math.round((n_ai_focus / n_enriched) * 100) : 0,
      ai_skills_pct: n_enriched ? Math.round((n_ai_skills / n_enriched) * 100) : 0,
    },
  }
}

function filterExperience(
  experience: ExperienceData,
  filteredJobIds: Set<string>,
  hasFilter: boolean,
): { tags: ExperienceTag[]; jobsByTag: ExperienceData['jobs_by_tag']; nJobsWithTags: number; nActive: number } {
  if (!hasFilter) {
    return {
      tags: experience.tags,
      jobsByTag: experience.jobs_by_tag,
      nJobsWithTags: experience.n_jobs_with_tags,
      nActive: experience.n_active,
    }
  }

  const filteredJobsByTag: ExperienceData['jobs_by_tag'] = {}
  const jobsWithAnyTag = new Set<string>()

  for (const [tag, tagJobs] of Object.entries(experience.jobs_by_tag)) {
    const matching = tagJobs.filter((j) => filteredJobIds.has(j.job_id))
    if (matching.length > 0) {
      filteredJobsByTag[tag] = matching
      matching.forEach((j) => jobsWithAnyTag.add(j.job_id))
    }
  }

  const filteredTags: ExperienceTag[] = experience.tags
    .map((t) => ({ ...t, count: filteredJobsByTag[t.tag]?.length ?? 0 }))
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count)

  return {
    tags: filteredTags,
    jobsByTag: filteredJobsByTag,
    nJobsWithTags: jobsWithAnyTag.size,
    nActive: filteredJobIds.size,
  }
}

function languageItems(lang: { label: string; count: number }[], germanReq: { label: string; count: number }[]) {
  const enNone = germanReq.find((g) => g.label === 'not_mentioned')?.count ?? 0
  const enPlus = germanReq.find((g) => g.label === 'plus')?.count ?? 0
  const enMust = germanReq.find((g) => g.label === 'must')?.count ?? 0
  const deCount = lang.find((l) => l.label === 'de')?.count ?? 0

  return [
    { label: 'English · No German', count: enNone, color: '#4ade80' },
    { label: 'English · German a Plus', count: enPlus, color: '#2dd4bf' },
    { label: 'English · German Required', count: enMust, color: '#60a5fa' },
    { label: 'German Posting', count: deCount, color: '#818cf8' },
  ].filter((i) => i.count > 0)
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  dist: Distributions
  overview: Overview
  experience: ExperienceData
  jobs: Job[]
}

export default function MarketClient({ dist, overview, experience, jobs }: Props) {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS)

  const hasFilter = Object.values(filters).some((v) => v !== 'all')

  const filteredJobs = useMemo(
    () => (hasFilter ? applyFilters(jobs, filters) : jobs),
    [jobs, filters, hasFilter]
  )

  const activeDist = useMemo(
    () => (hasFilter ? deriveDist(filteredJobs) : null),
    [filteredJobs, hasFilter]
  )

  const filteredJobIds = useMemo(
    () => (hasFilter ? new Set(filteredJobs.map((j) => j.id)) : new Set<string>()),
    [filteredJobs, hasFilter]
  )

  const filteredExp = useMemo(
    () => filterExperience(experience, filteredJobIds, hasFilter),
    [experience, filteredJobIds, hasFilter]
  )

  // Resolve distributions: filtered or base
  const seniority  = activeDist?.seniority        ?? dist.seniority
  const work_mode  = activeDist?.work_mode         ?? dist.work_mode
  const pm_type    = activeDist?.pm_type           ?? dist.pm_type
  const industry   = activeDist?.industry          ?? dist.industry
  const language   = activeDist?.language          ?? dist.language
  const german_req = activeDist?.german_requirement ?? dist.german_requirement
  const ai         = activeDist?.ai               ?? dist.ai
  const { source, companies } = dist // always unfiltered

  const n_active = hasFilter ? filteredJobs.length : overview.n_active

  // --- Seniority ---
  const seniorityItems = [
    ...seniority.filter((i) => i.label !== 'unknown'),
    ...seniority.filter((i) => i.label === 'unknown'),
  ].map((i) => ({ ...i, color: SENIORITY_COLORS[i.label] ?? '#818cf8' }))

  const senClassified = seniority.filter((i) => i.label !== 'unknown').reduce((s, i) => s + i.count, 0)
  const senTotal = seniority.reduce((s, i) => s + i.count, 0)

  // --- Work mode ---
  const workModeItems = WORK_MODE_ORDER
    .map((key) => {
      const item = work_mode.find((m) => m.label === key)
      if (!item) return null
      return {
        label: WORK_MODE_LABELS[key] ?? key,
        count: item.count,
        color: WORK_MODE_COLORS[key] ?? '#818cf8',
      }
    })
    .filter((item): item is { label: string; count: number; color: string } => item !== null)

  const wmClassified = work_mode.filter((i) => i.label !== 'unknown').reduce((s, i) => s + i.count, 0)
  const wmTotal = work_mode.reduce((s, i) => s + i.count, 0)
  const wmCoverageLow = wmTotal > 0 && (wmTotal - wmClassified) / wmTotal > 0.3

  // --- Role type ---
  const pmTypeItems = pm_type.map((i) => ({
    ...i,
    color: PM_TYPE_COLORS[i.label] ?? '#818cf8',
  }))
  const pmClassified = pm_type.reduce((s, i) => s + i.count, 0)

  // --- Language ---
  const langItems = languageItems(language, german_req)

  // --- Companies ---
  const companyItems = companies.top20.slice(0, 10).map((c) => ({
    ...c,
    color: '#818cf8',
  }))

  return (
    <>
      {/* Filters */}
      {jobs.length > 0 && (
        <FilterBar filters={filters} onChange={setFilters} />
      )}

      {/* ================================================================== */}
      {/* Page header                                                        */}
      {/* ================================================================== */}
      <div className="pt-2 pb-2">
        <h1 className="text-2xl font-bold tracking-tight text-white">Market shape</h1>
        <p className="text-muted mt-1.5 text-sm max-w-xl">
          Structure, demand signals, and employer landscape for {n_active > 0 ? n_active : '—'} active PM roles.
        </p>
      </div>

      {/* ================================================================== */}
      {/* A. Market composition                                              */}
      {/* ================================================================== */}
      <BlockHeading
        title="Market composition"
        description="How the active market breaks down by level, role type, language, and work style."
      />

      <Section
        title="Seniority"
        meta={
          senTotal > 0 && senClassified < senTotal
            ? `${senClassified} of ${senTotal} classified`
            : undefined
        }
      >
        {seniorityItems.length > 0 ? (
          <Card>
            <StatBar items={seniorityItems} showPct total={n_active > 0 ? n_active : undefined} />
          </Card>
        ) : (
          <EmptyState message="No seniority data available yet." />
        )}
      </Section>

      <Section
        title="Role type"
        meta={
          n_active > 0 && pmClassified < n_active
            ? `${pmClassified} of ${n_active} enriched`
            : undefined
        }
      >
        {pmTypeItems.length > 0 ? (
          <Card>
            <StatBar items={pmTypeItems} showPct total={n_active > 0 ? n_active : undefined} />
          </Card>
        ) : (
          <EmptyState message="Role type classification building. Roles are classified daily." />
        )}
      </Section>

      {langItems.length > 0 && (
        <Section
          title="Language requirements"
          description="Posting language and German requirement combined."
        >
          <Card>
            <StackedBar items={langItems} />
          </Card>
        </Section>
      )}

      <Section
        title="Work style"
        compact={wmCoverageLow}
        meta={
          wmTotal > 0 && wmClassified < wmTotal
            ? `${wmClassified} of ${wmTotal} specify an arrangement — treat as directional`
            : undefined
        }
      >
        {workModeItems.length > 0 ? (
          <Card>
            <StatBar items={workModeItems} showPct total={n_active > 0 ? n_active : undefined} />
          </Card>
        ) : (
          <EmptyState message="Work mode data is building up." />
        )}
      </Section>

      {/* ================================================================== */}
      {/* B. What companies look for                                         */}
      {/* ================================================================== */}
      <BlockHeading
        title="What companies look for"
        description="Domain background, functional skills, and operating context companies expect from PMs."
      />

      {filteredExp.tags.length > 0 && (
        <Section
          title="Required experience"
          description="Extracted from job descriptions — click any bar to see matching roles."
          meta={
            filteredExp.nJobsWithTags > 0 && filteredExp.nActive > 0
              ? `${filteredExp.nJobsWithTags} of ${filteredExp.nActive} active roles classified`
              : undefined
          }
        >
          <Card>
            <ExperienceChart
              tags={filteredExp.tags}
              jobsByTag={filteredExp.jobsByTag}
              nJobsWithTags={filteredExp.nJobsWithTags}
              nActive={filteredExp.nActive}
            />
          </Card>
        </Section>
      )}

      {/* AI demand signals */}
      {ai.n_enriched > 0 && (
        <Section title="AI demand" compact>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-surface border border-border rounded-xl p-4">
              <p className="text-2xl font-bold text-white tabular-nums">{ai.ai_focus_pct}%</p>
              <p className="text-sm text-muted mt-1">AI as core focus</p>
              <p className="text-2xs text-subtle mt-0.5">{ai.n_ai_focus} of {ai.n_enriched} classified roles</p>
            </div>
            <div className="bg-surface border border-border rounded-xl p-4">
              <p className="text-2xl font-bold text-white tabular-nums">{ai.ai_skills_pct}%</p>
              <p className="text-sm text-muted mt-1">AI skills expected</p>
              <p className="text-2xs text-subtle mt-0.5">{ai.n_ai_skills} of {ai.n_enriched} classified roles</p>
            </div>
          </div>
        </Section>
      )}

      {industry.length > 0 && (
        <Section
          title="Industry"
          description="Which sectors are hiring product managers."
          compact
        >
          <Card>
            <StatBar items={industry.map((i, idx) => ({
              ...i,
              color: ['#818cf8','#60a5fa','#2dd4bf','#4ade80','#fb923c','#f472b6','#a78bfa','#34d399'][idx % 8],
            }))} showPct />
          </Card>
        </Section>
      )}

      {/* ================================================================== */}
      {/* C. Employer landscape                                              */}
      {/* ================================================================== */}
      <BlockHeading
        title="Employer landscape"
        description="Who is hiring and how concentrated the market is."
      />

      <Section
        title="Companies"
        description={
          companies.n_companies > 0
            ? `${companies.n_companies} unique employers · ${companies.multi_hiring} hiring 2+ roles · top 10 account for ${companies.top10_pct}%`
            : undefined
        }
      >
        {companyItems.length > 0 ? (
          <Card>
            <StatBar
              items={companyItems}
              total={n_active > 0 ? n_active : undefined}
              showPct
            />
          </Card>
        ) : (
          <EmptyState message="Company data is building up." />
        )}
      </Section>

      {source.length > 0 && (
        <section className="mt-8">
          <p className="text-2xs text-subtle uppercase tracking-widest mb-2">Data sources</p>
          <div className="flex gap-5 flex-wrap">
            {source.map((s, i) => (
              <span key={`${s.label}-${i}`} className="text-xs text-muted">
                {s.label === 'jsearch' ? 'JSearch' : s.label === 'arbeitnow' ? 'Arbeitnow' : s.label === 'ats' ? 'ATS' : s.label}:
                {' '}{s.count} roles
              </span>
            ))}
          </div>
        </section>
      )}
    </>
  )
}
