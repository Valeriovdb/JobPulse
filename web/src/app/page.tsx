import { getOverview, getDistributions } from '@/lib/data'
import { KpiCard, KpiGrid } from '@/components/kpi-card'
import { Section, Card } from '@/components/section'
import { StatBar, StackedBar } from '@/components/stat-bar'

function languageItems(lang: { en_none: number; en_plus: number; en_must: number; de: number }) {
  return [
    { label: 'English · No German', count: lang.en_none, color: '#4ade80' },
    { label: 'English · German a Plus', count: lang.en_plus, color: '#2dd4bf' },
    { label: 'English · German Required', count: lang.en_must, color: '#60a5fa' },
    { label: 'German Posting', count: lang.de, color: '#818cf8' },
  ].filter((i) => i.count > 0)
}

function locationItems(loc: { berlin: number; remote_germany: number; unclear: number }) {
  return [
    { label: 'Berlin on-site', count: loc.berlin, color: '#818cf8' },
    { label: 'Remote Germany', count: loc.remote_germany, color: '#60a5fa' },
    { label: 'Location unclear', count: loc.unclear, color: '#fb923c' },
  ].filter((i) => i.count > 0)
}

const PM_TYPE_LABELS: Record<string, string> = {
  core_pm: 'Core PM',
  technical: 'Technical PM',
  growth: 'Growth / PLG',
  data: 'Data / Analytics',
  other: 'Other',
}

function generateInsights(
  overview: ReturnType<typeof getOverview>,
  dist: ReturnType<typeof getDistributions>
): string[] {
  const insights: string[] = []
  const { accessible_pct, senior_pct, n_active, language, location } = overview
  const { ai } = dist

  if (accessible_pct >= 20) {
    insights.push(
      `${accessible_pct}% of roles in the current snapshot list no German requirement — English-accessible coverage is a meaningful share of the market.`
    )
  } else if (accessible_pct > 0) {
    insights.push(
      `Only ${accessible_pct}% of active roles list no German requirement. The current sample suggests German fluency significantly widens market access.`
    )
  }

  if (senior_pct >= 60) {
    insights.push(
      `${senior_pct}% of classified roles are Senior or above in this snapshot. Mid-level and below roles represent a smaller share of current postings.`
    )
  } else if (senior_pct > 0) {
    insights.push(
      `The current sample shows a mixed seniority profile (${senior_pct}% Senior+), with representation across multiple levels.`
    )
  }

  if (ai.n_enriched > 0 && ai.ai_focus_pct >= 20) {
    insights.push(
      `Among ${ai.n_enriched} classified roles, ${ai.ai_focus_pct}% list AI as a core focus area — a directional signal that AI product experience is increasingly expected.`
    )
  }

  const remotePct = n_active > 0
    ? Math.round((location.remote_germany / n_active) * 100)
    : 0
  if (remotePct >= 15 && insights.length < 3) {
    insights.push(
      `${remotePct}% of roles in this snapshot are explicitly remote-friendly — a notable share for a Berlin-focused search.`
    )
  }

  if (language.de > language.en_none + language.en_plus + language.en_must && insights.length < 3) {
    insights.push(
      `German-language postings account for most active roles in the current sample, making German-source coverage important for full market visibility.`
    )
  }

  return insights.slice(0, 3)
}

function workModeItems(modes: { label: string; count: number }[]) {
  const order = ['onsite', 'hybrid_4d', 'hybrid_3d', 'hybrid_2d', 'hybrid_1d', 'hybrid', 'remote', 'unknown']
  const labelMap: Record<string, string> = {
    onsite: 'On-site',
    hybrid_4d: 'Hybrid · 4d',
    hybrid_3d: 'Hybrid · 3d',
    hybrid_2d: 'Hybrid · 2d',
    hybrid_1d: 'Hybrid · 1d',
    hybrid: 'Hybrid (General)',
    remote: 'Remote',
    unknown: 'Unclassified',
  }
  const colorMap: Record<string, string> = {
    onsite: '#ef4444', // Red-ish for onsite
    hybrid_4d: '#f97316', // Orange
    hybrid_3d: '#facc15', // Yellow
    hybrid_2d: '#4ade80', // Green
    hybrid_1d: '#2dd4bf', // Teal
    hybrid: '#60a5fa', // Blue
    remote: '#818cf8', // Indigo/Purple for remote
    unknown: '#a3a3a3', // Neutral for unknown (grey is okay for unclassified)
  }

  return order.map((key) => {
    const item = modes.find((m) => m.label === key)
    return {
      label: labelMap[key],
      count: item?.count ?? 0,
      color: colorMap[key],
    }
  })
}

export default function OverviewPage() {
  const overview = getOverview()
  const dist = getDistributions()
  const { n_active, n_new_week, median_age_days, accessible_pct } = overview
  const { pm_type, industry, ai, companies, work_mode } = dist
  const insights = generateInsights(overview, dist)

  const pmTypeItems = pm_type.map((item, i) => ({
    label: PM_TYPE_LABELS[item.label] ?? item.label,
    count: item.count,
    color: ['#818cf8', '#60a5fa', '#2dd4bf', '#4ade80', '#fb923c'][i % 5],
  }))

  const industryItems = industry.slice(0, 8).map((item, i) => ({
    label: item.label,
    count: item.count,
    color: [
      '#818cf8',
      '#60a5fa',
      '#2dd4bf',
      '#4ade80',
      '#fb923c',
      '#f472b6',
      '#a78bfa',
      '#34d399',
    ][i % 8],
  }))

  const classifiedLocation = overview.location.berlin + overview.location.remote_germany

  return (
    <>
      <div className="pt-2 pb-2">
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Berlin PM Market
        </h1>
        <p className="text-muted mt-1.5 text-sm max-w-xl">
          Daily intelligence on product management roles in Berlin and remote Germany.
        </p>
        {n_active > 0 && (
          <p className="text-2xs text-subtle mt-2">
            Snapshot: {n_active} active roles · Berlin + remote Germany
          </p>
        )}
      </div>

      <div className="mt-8">
        <KpiGrid>
          <KpiCard value={n_active} label="Active roles" sub="in tracker" />
          <KpiCard
            value={n_new_week}
            label="New this week"
            sub={n_new_week >= n_active && n_active > 0 ? 'tracker building history' : 'past 7 days'}
          />
          <KpiCard
            value={companies.n_companies > 0 ? companies.n_companies : '—'}
            label="Unique companies"
            sub="actively hiring"
          />
          <KpiCard
            value={median_age_days > 0 ? `${median_age_days}d` : '—'}
            label="Median role age"
            sub="in tracker"
          />
        </KpiGrid>
      </div>

      <Section
        title="Market access"
        description={
          accessible_pct > 0
            ? `${accessible_pct}% of active roles require no German.`
            : 'Language requirement breakdown for active roles.'
        }
      >
        <Card>
          <StackedBar items={languageItems(overview.language)} />
        </Card>
      </Section>

      <Section
        title="Location distribution"
        meta={
          classifiedLocation < n_active && n_active > 0
            ? `Coverage: ${classifiedLocation} of ${n_active} classified`
            : undefined
        }
      >
        <Card>
          <StackedBar items={locationItems(overview.location)} />
        </Card>
      </Section>

      <Section
        title="Work style"
        description="Flexibility and on-site requirements."
      >
        <Card>
          <StackedBar items={workModeItems(work_mode)} alwaysShowLabels />
        </Card>
      </Section>

      {pmTypeItems.length > 0 && (
        <Section
          title="Role type"
          description="What kind of PM work is in demand right now."
        >
          <Card>
            <StatBar items={pmTypeItems} showPct />
          </Card>
        </Section>
      )}

      {ai.n_enriched > 0 && (
        <Section
          title="AI requirement"
          description={`Based on ${ai.n_enriched} classified roles.`}
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-surface border border-border rounded-xl p-5">
              <p className="text-3xl font-bold text-white tabular-nums">{ai.ai_focus_pct}%</p>
              <p className="text-sm text-muted mt-1">AI as core focus</p>
              <p className="text-2xs text-subtle mt-0.5">{ai.n_ai_focus} roles</p>
            </div>
            <div className="bg-surface border border-border rounded-xl p-5">
              <p className="text-3xl font-bold text-white tabular-nums">{ai.ai_skills_pct}%</p>
              <p className="text-sm text-muted mt-1">AI skills required</p>
              <p className="text-2xs text-subtle mt-0.5">{ai.n_ai_skills} roles</p>
            </div>
          </div>
        </Section>
      )}

      {industryItems.length > 0 && (
        <Section
          title="Industry"
          description="Where PM roles are concentrating."
        >
          <Card>
            <StatBar items={industryItems} showPct />
          </Card>
        </Section>
      )}

      {insights.length > 0 && (
        <Section
          title="Read before you search"
          description="Signals from the current dataset worth knowing."
        >
          <div className="space-y-3">
            {insights.map((text, i) => (
              <div key={i} className="bg-surface border border-border rounded-xl p-4 flex gap-3">
                <span className="text-accent mt-0.5 shrink-0 text-sm">→</span>
                <p className="text-sm text-white leading-relaxed">{text}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {n_active === 0 && (
        <div className="mt-12 bg-surface border border-border rounded-xl p-10 text-center">
          <p className="text-muted text-sm">
            No data available yet. The pipeline runs daily — check back tomorrow.
          </p>
        </div>
      )}
    </>
  )
}
