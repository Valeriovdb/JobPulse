import { getOverview, getDistributions } from '@/lib/data'
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

  if (accessible_pct > 0) {
    insights.push(
      `${accessible_pct}% of roles in the current snapshot do not explicitly require German — a meaningful share of the market.`
    )
  }

  if (senior_pct >= 60) {
    insights.push(
      `${senior_pct}% of classified roles are Senior or above. Mid-level and below roles represent a smaller share of current postings.`
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
      `${remotePct}% of roles in this snapshot are explicitly remote-friendly — a notable share for a Berlin-focused market.`
    )
  }

  if (language.de > language.en_none + language.en_plus + language.en_must && insights.length < 3) {
    insights.push(
      `German-language postings account for most active roles in the current sample, highlighting the importance of German-source coverage for full market visibility.`
    )
  }

  return insights.slice(0, 3)
}

function workModeItems(modes: { label: string; count: number }[]) {
  // remote → onsite: left = most flexible, right = fully in-office
  const order = ['remote', 'hybrid_1d', 'hybrid_2d', 'hybrid_3d', 'hybrid_4d', 'hybrid', 'onsite', 'unknown']
  const labelMap: Record<string, string> = {
    remote:    'Remote',
    hybrid_1d: 'Hybrid · 1d',
    hybrid_2d: 'Hybrid · 2d',
    hybrid_3d: 'Hybrid · 3d',
    hybrid_4d: 'Hybrid · 4d',
    hybrid:    'Hybrid (General)',
    onsite:    'On-site',
    unknown:   'Unclassified',
  }
  const colorMap: Record<string, string> = {
    remote:    '#22d3ee',  // cyan — most flexible
    hybrid_1d: '#60a5fa',  // blue
    hybrid_2d: '#818cf8',  // indigo
    hybrid_3d: '#a78bfa',  // violet
    hybrid_4d: '#c084fc',  // purple
    hybrid:    '#737373',  // neutral — unspecified hybrid
    onsite:    '#fb923c',  // orange — fully in-office
    unknown:   '#a3a3a3',
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
  const { n_active, n_new_week, median_age_days, senior_pct } = overview
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
      '#818cf8', '#60a5fa', '#2dd4bf', '#4ade80',
      '#fb923c', '#f472b6', '#a78bfa', '#34d399',
    ][i % 8],
  }))

  const classifiedLocation = overview.location.berlin + overview.location.remote_germany

  const signalMetrics: Array<{ value: string | number; label: string }> = [
    { value: n_active,                                                          label: 'Active roles'  },
    { value: n_new_week,                                                        label: 'New this week' },
    { value: companies.n_companies > 0 ? companies.n_companies : '—',          label: 'Companies'     },
    { value: median_age_days > 0      ? `${median_age_days}d`  : '—',          label: 'Median age'    },
  ]

  return (
    <>
      {/* ------------------------------------------------------------------ */}
      {/* Hero                                                                */}
      {/* ------------------------------------------------------------------ */}
      <div className="pt-2 pb-14 border-b border-border">
        <p className="text-2xs text-subtle uppercase tracking-widest mb-10">
          Berlin · PM Market
        </p>

        {/* Headline */}
        <div className="mb-5">
          <h1 className="text-4xl sm:text-5xl font-bold text-white tracking-tighter leading-none">
            Berlin PM market snapshot
          </h1>
        </div>

        {/* Annotation */}
        <p className="text-sm text-subtle max-w-lg leading-relaxed mb-12">
          {n_active} active PM roles across Berlin and remote Germany.
          {' '}The current snapshot highlights market size, role mix, and hiring signals.
        </p>

        {/* Signal strip */}
        <div className="flex items-start">
          {signalMetrics.map((metric, i) => (
            <div
              key={i}
              className={`flex-1 ${i > 0 ? 'pl-8 border-l border-border' : 'pr-8'}`}
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
      {/* Language requirements                                               */}
      {/* ------------------------------------------------------------------ */}
      <Section
        title="Language requirements"
        description="Posting language and German requirement across active roles."
      >
        <Card>
          <StackedBar items={languageItems(overview.language)} />
        </Card>
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* Location + Work style — side by side                               */}
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
            <StackedBar items={locationItems(overview.location)} />
          </Card>
        </div>
        <div>
          <p className="text-2xs text-subtle uppercase tracking-widest mb-2">Work style</p>
          <p className="text-sm text-white font-medium leading-relaxed mb-3">
            Flexibility and on-site requirements.
          </p>
          <Card>
            <StackedBar items={workModeItems(work_mode)} alwaysShowLabels />
          </Card>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Role type                                                           */}
      {/* ------------------------------------------------------------------ */}
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

      {/* ------------------------------------------------------------------ */}
      {/* AI requirement                                                      */}
      {/* ------------------------------------------------------------------ */}
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

      {/* ------------------------------------------------------------------ */}
      {/* Industry                                                            */}
      {/* ------------------------------------------------------------------ */}
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
    </>
  )
}
