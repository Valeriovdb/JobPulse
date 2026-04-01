import { getOverview, getDistributions, getChartInsights } from '@/lib/data'
import { Card } from '@/components/section'
import { StatBar, StackedBar } from '@/components/stat-bar'

// ---------------------------------------------------------------------------
// Module 3 — German requirement
// ---------------------------------------------------------------------------

const GERMAN_REQ_ORDER = ['not_mentioned', 'plus', 'must', 'unclassified'] as const

const GERMAN_REQ_LABELS: Record<string, string> = {
  not_mentioned: 'No German explicitly required',
  plus:          'German a plus',
  must:          'German required',
  unclassified:  'Unclassified',
}

const GERMAN_REQ_COLORS: Record<string, string> = {
  not_mentioned: '#4ade80',
  plus:          '#2dd4bf',
  must:          '#60a5fa',
  unclassified:  '#525252',
}

// ---------------------------------------------------------------------------
// Module 4 — Role type
// ---------------------------------------------------------------------------

const PM_TYPE_ORDER = ['core_pm', 'technical', 'customer_facing', 'data_ai', 'platform'] as const

const PM_TYPE_LABELS: Record<string, string> = {
  core_pm:          'Core PM',
  technical:        'Technical PM',
  customer_facing:  'Customer-facing PM',
  data_ai:          'Data / AI PM',
  platform:         'Platform PM',
}

const PM_TYPE_COLORS: Record<string, string> = {
  core_pm:         '#818cf8',
  technical:       '#60a5fa',
  customer_facing: '#4ade80',
  data_ai:         '#f472b6',
  platform:        '#a78bfa',
}

// ---------------------------------------------------------------------------
// Module 4 — Seniority
// ---------------------------------------------------------------------------

const SEN_ORDER = ['junior', 'mid', 'mid_senior', 'senior', 'lead', 'staff', 'principal', 'head', 'unknown'] as const

const SEN_LABELS: Record<string, string> = {
  junior:     'Junior',
  mid:        'Mid',
  mid_senior: 'Mid / Senior',
  senior:     'Senior',
  lead:       'Lead',
  staff:      'Staff',
  principal:  'Principal',
  head:       'Head',
  unknown:    'Unclassified',
}

const SEN_COLORS = [
  '#4ade80',  // Junior
  '#34d399',  // Mid
  '#2dd4bf',  // Mid / Senior
  '#60a5fa',  // Senior
  '#818cf8',  // Lead
  '#6366f1',  // Staff
  '#a78bfa',  // Principal
  '#c084fc',  // Head
  '#525252',  // Unclassified
]

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function OverviewPage() {
  const overview = getOverview()
  const dist = getDistributions()
  const insights = getChartInsights()

  const { n_active, n_new_week, median_age_days } = overview
  const { pm_type, seniority, ai, companies, german_requirement } = dist

  // --- Module 2: KPI strip ---
  const hasMedianAge = median_age_days > 0
  const kpis = [
    { value: n_active,                                                  label: 'ACTIVE ROLES'          },
    { value: n_new_week,                                                label: 'NEW THIS WEEK'         },
    { value: companies.n_companies > 0 ? companies.n_companies : '—',  label: 'COMPANIES HIRING'      },
    hasMedianAge
      ? { value: `${median_age_days}d`,                                 label: 'MEDIAN POSTING AGE'    }
      : { value: n_new_week,                                            label: 'POSTED IN LAST 7 DAYS' },
  ]

  // --- Module 3: German requirement ---
  const germanReqMap = Object.fromEntries(german_requirement.map((i) => [i.label, i.count]))
  const germanReqItems = GERMAN_REQ_ORDER
    .map((key) => ({
      label: GERMAN_REQ_LABELS[key],
      count: germanReqMap[key] ?? 0,
      color: GERMAN_REQ_COLORS[key],
    }))
    .filter((i) => i.count > 0)

  // --- Module 4 left: Role type ---
  const pmMap = Object.fromEntries(pm_type.map((i) => [i.label, i.count]))
  const pmTypeItems = PM_TYPE_ORDER
    .filter((key) => (pmMap[key] ?? 0) > 0)
    .map((key) => ({
      label: PM_TYPE_LABELS[key],
      count: pmMap[key]!,
      color: PM_TYPE_COLORS[key],
    }))

  // --- Module 4 right: Seniority ---
  const senMap = Object.fromEntries(seniority.map((i) => [i.label, i.count]))
  const senItems = SEN_ORDER
    .filter((key) => (senMap[key] ?? 0) > 0)
    .map((key, idx) => ({
      label: SEN_LABELS[key],
      count: senMap[key]!,
      color: SEN_COLORS[idx],
    }))

  return (
    <>
      {/* ------------------------------------------------------------------ */}
      {/* Module 1 — Hero                                                     */}
      {/* ------------------------------------------------------------------ */}
      <div className="pt-2 pb-8 border-b border-border">
        <p className="text-2xs text-subtle uppercase tracking-widest mb-6">
          Berlin · PM Market
        </p>
        <h1 className="text-4xl sm:text-5xl font-bold text-white tracking-tighter leading-none mb-4">
          Berlin PM market snapshot
        </h1>
        <p className="text-sm text-subtle max-w-lg leading-relaxed">
          Current active PM roles across Berlin and remote Germany, with the main hiring
          constraints and role mix visible at a glance.
        </p>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Module 2 — KPI strip                                                */}
      {/* ------------------------------------------------------------------ */}
      <div className="mt-6 flex items-start border-b border-border pb-8">
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

      {/* ------------------------------------------------------------------ */}
      {/* Module 3 — Primary chart: German requirement                        */}
      {/* ------------------------------------------------------------------ */}
      {germanReqItems.length > 0 && (
        <section className="mt-10">
          <p className="text-2xs text-subtle uppercase tracking-widest mb-2">Market Access</p>
          <p className="text-base font-semibold text-white mb-1">
            {insights.charts.german_requirement?.title ?? 'How restrictive is the market right now?'}
          </p>
          <p className="text-xs text-subtle mb-4 max-w-lg leading-relaxed">
            {insights.charts.german_requirement?.subtitle ?? 'Share of active roles by explicit German requirement.'}
          </p>
          <Card>
            <StackedBar items={germanReqItems} />
          </Card>
        </section>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Module 4 — Two-column: Role type + Seniority                        */}
      {/* ------------------------------------------------------------------ */}
      <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left: Role type */}
        {pmTypeItems.length > 0 && (
          <div>
            <p className="text-2xs text-subtle uppercase tracking-widest mb-2">Role Mix</p>
            <p className="text-sm font-semibold text-white mb-1">
              {insights.charts.pm_type?.title ?? 'What kind of PM roles dominate?'}
            </p>
            <p className="text-xs text-subtle mb-4 leading-relaxed">
              {insights.charts.pm_type?.subtitle ?? 'Distribution of active roles by role type.'}
            </p>
            <Card>
              <StatBar items={pmTypeItems} showPct />
            </Card>
          </div>
        )}

        {/* Right: Seniority */}
        {senItems.length > 0 && (
          <div>
            <p className="text-2xs text-subtle uppercase tracking-widest mb-2">Seniority</p>
            <p className="text-sm font-semibold text-white mb-1">
              {insights.charts.seniority?.title ?? 'At what level is the market concentrated?'}
            </p>
            <p className="text-xs text-subtle mb-4 leading-relaxed">
              {insights.charts.seniority?.subtitle ?? 'Distribution of active roles by seniority.'}
            </p>
            <Card>
              <StatBar items={senItems} showPct />
            </Card>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Module 5 — AI signal                                                */}
      {/* ------------------------------------------------------------------ */}
      {ai.n_enriched > 0 && (
        <section className="mt-10">
          <p className="text-2xs text-subtle uppercase tracking-widest mb-1">AI Signal</p>
          {insights.charts.ai && (
            <>
              <p className="text-sm font-semibold text-white mb-1">{insights.charts.ai.title}</p>
              <p className="text-xs text-subtle mb-3 max-w-lg leading-relaxed">{insights.charts.ai.subtitle}</p>
            </>
          )}
          {!insights.charts.ai && <div className="mb-3" />}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-surface border border-border rounded-xl p-4">
              <p className="text-2xl font-bold text-white tabular-nums">{ai.ai_focus_pct}%</p>
              <p className="text-xs text-white/90 font-medium mt-1">AI as core focus</p>
              <p className="text-2xs text-subtle mt-0.5">based on classified roles only</p>
            </div>
            <div className="bg-surface border border-border rounded-xl p-4">
              <p className="text-2xl font-bold text-white tabular-nums">{ai.ai_skills_pct}%</p>
              <p className="text-xs text-white/90 font-medium mt-1">AI skills expected</p>
              <p className="text-2xs text-subtle mt-0.5">based on classified roles only</p>
            </div>
          </div>
        </section>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Empty state                                                          */}
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
