import { getDistributions, getOverview, getExperience } from '@/lib/data'
import { Section, Card, EmptyState, BlockHeading } from '@/components/section'
import { StatBar, StackedBar } from '@/components/stat-bar'
import { ExperienceChart } from '@/components/experience-chart'

// ---------------------------------------------------------------------------
// Color / label maps
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

function languageItems(lang: { label: string; count: number }[], germanReq: { label: string; count: number }[]) {
  // Combine posting language + german requirement into a clear stacked bar
  const enCount = lang.find((l) => l.label === 'en')?.count ?? 0
  const deCount = lang.find((l) => l.label === 'de')?.count ?? 0
  const enNone = germanReq.find((g) => g.label === 'not_mentioned')?.count ?? 0
  const enPlus = germanReq.find((g) => g.label === 'plus')?.count ?? 0
  const enMust = germanReq.find((g) => g.label === 'must')?.count ?? 0

  return [
    { label: 'English · No German', count: enNone, color: '#4ade80' },
    { label: 'English · German a Plus', count: enPlus, color: '#2dd4bf' },
    { label: 'English · German Required', count: enMust, color: '#60a5fa' },
    { label: 'German Posting', count: deCount, color: '#818cf8' },
  ].filter((i) => i.count > 0)
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function MarketPage() {
  const dist = getDistributions()
  const overview = getOverview()
  const experience = getExperience()
  const { seniority, work_mode, pm_type, industry, ai, source, companies, language, german_requirement } = dist
  const { n_active } = overview

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
  const langItems = languageItems(language, german_requirement)

  // --- Companies ---
  const companyItems = companies.top20.slice(0, 10).map((c) => ({
    ...c,
    color: '#818cf8',
  }))

  return (
    <>
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
          description={
            langItems.length > 0
              ? 'Posting language and German requirement combined.'
              : undefined
          }
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

      {experience.tags.length > 0 && (
        <Section
          title="Required experience"
          description="Extracted from job descriptions — click any bar to see matching roles."
          meta={
            experience.n_jobs_with_tags > 0 && experience.n_active > 0
              ? `${experience.n_jobs_with_tags} of ${experience.n_active} active roles classified`
              : undefined
          }
        >
          <Card>
            <ExperienceChart
              tags={experience.tags}
              jobsByTag={experience.jobs_by_tag}
              nJobsWithTags={experience.n_jobs_with_tags}
              nActive={experience.n_active}
            />
          </Card>
        </Section>
      )}

      {/* AI demand signals — adjacent to experience */}
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
            <StatBar items={industry} showPct />
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
