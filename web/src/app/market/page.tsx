import { getDistributions, getOverview } from '@/lib/data'
import { Section, Card, EmptyState } from '@/components/section'
import { StatBar } from '@/components/stat-bar'

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

const WORK_MODE_COLORS: Record<string, string> = {
  remote: '#4ade80',
  hybrid_1d: '#60a5fa',
  hybrid_2d: '#60a5fa',
  hybrid_3d: '#818cf8',
  hybrid_4d: '#a78bfa',
  hybrid: '#60a5fa',
  onsite: '#fb923c',
  unknown: '#404040',
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

function generateSummary(
  dist: ReturnType<typeof getDistributions>,
  n_active: number,
): string[] {
  const summaries: string[] = []
  const { seniority, work_mode, pm_type, companies } = dist

  // Work-style coverage
  const wm_unknown = work_mode.find((i) => i.label === 'unknown')?.count ?? 0
  if (n_active > 0 && wm_unknown > 0) {
    const unclassified_pct = Math.round((wm_unknown / n_active) * 100)
    if (unclassified_pct >= 30) {
      summaries.push(
        `Work-style data is sparse — ${unclassified_pct}% of roles don't specify an arrangement. Treat the distribution as directional.`
      )
    }
  }

  // Seniority coverage
  const sen_unknown = seniority.find((i) => i.label === 'unknown')?.count ?? 0
  if (n_active > 0 && sen_unknown > 0) {
    const unclassified_pct = Math.round((sen_unknown / n_active) * 100)
    if (unclassified_pct >= 20) {
      summaries.push(
        `${unclassified_pct}% of titles didn't yield a seniority signal — treat the level split as directional, not precise.`
      )
    }
  }

  // Company concentration
  if (companies.top10_pct >= 50 && companies.n_companies > 0) {
    summaries.push(
      `Hiring is moderately concentrated — top 10 companies account for ${companies.top10_pct}% of active roles across ${companies.n_companies} unique employers.`
    )
  }

  // Role type coverage
  const pm_classified = pm_type.reduce((s, i) => s + i.count, 0)
  if (n_active > 0 && pm_classified < n_active) {
    const enriched_pct = Math.round((pm_classified / n_active) * 100)
    if (enriched_pct < 80) {
      summaries.push(
        `Role type is classified for ${pm_classified} of ${n_active} active roles (${enriched_pct}%) — the remainder are pending enrichment.`
      )
    }
  }

  return summaries.slice(0, 4)
}

export default function MarketPage() {
  const dist = getDistributions()
  const overview = getOverview()
  const { seniority, work_mode, pm_type, industry, ai, source, companies } = dist
  const { n_active } = overview

  const summaries = generateSummary(dist, n_active)

  // Seniority: classified first, unknown last; with explicit colors
  const seniorityItems = [
    ...seniority.filter((i) => i.label !== 'unknown'),
    ...seniority.filter((i) => i.label === 'unknown'),
  ].map((i) => ({ ...i, color: SENIORITY_COLORS[i.label] ?? '#818cf8' }))

  const senClassified = seniority.filter((i) => i.label !== 'unknown').reduce((s, i) => s + i.count, 0)
  const senTotal = seniority.reduce((s, i) => s + i.count, 0)

  // Work mode: classified first, unknown last; with explicit colors
  const workModeItems = [
    ...work_mode.filter((i) => i.label !== 'unknown'),
    ...work_mode.filter((i) => i.label === 'unknown'),
  ].map((i) => ({ ...i, color: WORK_MODE_COLORS[i.label] ?? '#818cf8' }))

  const wmClassified = work_mode.filter((i) => i.label !== 'unknown').reduce((s, i) => s + i.count, 0)
  const wmTotal = work_mode.reduce((s, i) => s + i.count, 0)

  // Role type: with explicit colors
  const pmTypeItems = pm_type.map((i) => ({
    ...i,
    color: PM_TYPE_COLORS[i.label] ?? '#818cf8',
  }))

  const pmClassified = pm_type.reduce((s, i) => s + i.count, 0)

  // Companies: top 10 as ranked bar
  const companyItems = companies.top20.slice(0, 10).map((c) => ({
    ...c,
    color: '#818cf8',
  }))

  return (
    <>
      <div className="pt-2 pb-2">
        <h1 className="text-2xl font-bold tracking-tight text-white">Market shape</h1>
        <p className="text-muted mt-1.5 text-sm max-w-xl">
          What the active market looks like — seniority, work style, role type, and who is hiring.
        </p>
      </div>

      {summaries.length > 0 && (
        <div className="mt-6 space-y-2">
          {summaries.map((text, i) => (
            <div key={i} className="bg-surface border border-border rounded-lg px-4 py-2.5 flex gap-3">
              <span className="text-subtle shrink-0 text-sm mt-0.5">↳</span>
              <p className="text-sm text-muted leading-relaxed">{text}</p>
            </div>
          ))}
        </div>
      )}

      <Section
        title="Seniority"
        meta={
          senTotal > 0 && senClassified < senTotal
            ? `Coverage: ${senClassified} of ${senTotal} classified`
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
        title="Work style"
        meta={
          wmTotal > 0 && wmClassified < wmTotal
            ? `Coverage: ${wmClassified} of ${wmTotal} specify an arrangement`
            : undefined
        }
      >
        {workModeItems.length > 0 ? (
          <Card>
            <StatBar items={workModeItems} showPct total={n_active > 0 ? n_active : undefined} />
          </Card>
        ) : (
          <EmptyState message="Work mode data is building up. Check back as more roles are tracked." />
        )}
      </Section>

      <Section
        title="Role type"
        meta={
          n_active > 0 && pmClassified < n_active
            ? `Coverage: ${pmClassified} of ${n_active} enriched`
            : undefined
        }
      >
        {pmTypeItems.length > 0 ? (
          <div className="space-y-3">
            <Card>
              <StatBar items={pmTypeItems} showPct total={n_active > 0 ? n_active : undefined} />
            </Card>
            {ai.n_enriched > 0 && (
              <div className="bg-surface border border-border rounded-xl px-4 py-3 flex flex-wrap gap-x-6 gap-y-1">
                <p className="text-xs text-muted">
                  <span className="text-white font-medium">{ai.n_ai_focus}</span>
                  {' '}roles ({ai.ai_focus_pct}%) have AI as core focus
                </p>
                <p className="text-xs text-muted">
                  <span className="text-white font-medium">{ai.n_ai_skills}</span>
                  {' '}roles ({ai.ai_skills_pct}%) require AI skills
                </p>
              </div>
            )}
          </div>
        ) : (
          <EmptyState message="Role type classification building. Roles are classified daily." />
        )}
      </Section>

      {industry.length > 0 && (
        <Section
          title="Industry"
          description="Which sectors are hiring product managers."
        >
          <Card>
            <StatBar items={industry} showPct />
          </Card>
        </Section>
      )}

      <Section
        title="Company landscape"
        description={
          companies.n_companies > 0
            ? `${companies.n_companies} unique companies · ${companies.multi_hiring} hiring 2+ roles · top 10 account for ${companies.top10_pct}%`
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
        <section className="mt-12">
          <p className="text-xs text-subtle uppercase tracking-wider mb-2">Data sources</p>
          <div className="flex gap-5 flex-wrap">
            {source.map((s) => (
              <span key={s.label} className="text-xs text-muted">
                {s.label === 'jsearch' ? 'JSearch' : s.label === 'arbeitnow' ? 'Arbeitnow' : s.label}:
                {' '}{s.count} roles
              </span>
            ))}
          </div>
        </section>
      )}
    </>
  )
}
