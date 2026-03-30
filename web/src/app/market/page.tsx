import { getDistributions } from '@/lib/data'
import { Section, Card, EmptyState } from '@/components/section'
import { StatBar } from '@/components/stat-bar'
import { KpiCard, KpiGrid } from '@/components/kpi-card'

export default function MarketPage() {
  const dist = getDistributions()
  const { seniority, work_mode, pm_type, industry, ai, source, companies } = dist

  const workModeItems = work_mode.filter((i) => i.label !== 'unknown')
  const workModeUnknown = work_mode.find((i) => i.label === 'unknown')

  const seniorityOrdered = [
    ...seniority.filter((i) => i.label !== 'unknown'),
    ...seniority.filter((i) => i.label === 'unknown'),
  ]

  return (
    <>
      <div className="pt-2 pb-2">
        <h1 className="text-2xl font-bold tracking-tight text-white">Market shape</h1>
        <p className="text-muted mt-1.5 text-sm max-w-xl">
          What the active market looks like — seniority, work style, role type, and who is hiring.
        </p>
      </div>

      <Section
        title="Seniority"
        description="Distribution of classified seniority levels across active roles."
      >
        {seniorityOrdered.length > 0 ? (
          <Card>
            <StatBar items={seniorityOrdered} showPct />
          </Card>
        ) : (
          <EmptyState message="No seniority data available yet." />
        )}
      </Section>

      <Section
        title="Work style"
        description={
          workModeUnknown
            ? `${workModeUnknown.count} role${workModeUnknown.count !== 1 ? 's' : ''} did not specify a work arrangement.`
            : undefined
        }
      >
        {workModeItems.length > 0 ? (
          <Card>
            <StatBar items={workModeItems} showPct />
          </Card>
        ) : (
          <EmptyState message="Work mode data is building up. Check back as more roles are tracked." />
        )}
      </Section>

      <Section
        title="Role type"
        description={
          ai.n_enriched > 0
            ? `Based on LLM classification of ${ai.n_enriched} enriched roles.`
            : 'LLM classification of role type.'
        }
      >
        {pm_type.length > 0 ? (
          <div className="space-y-4">
            <Card>
              <StatBar items={pm_type} showPct />
            </Card>
            {ai.n_enriched > 0 && (
              <div className="grid grid-cols-2 gap-3">
                <KpiCard
                  value={`${ai.ai_focus_pct}%`}
                  label="AI-focused roles"
                  sub={`${ai.n_ai_focus} of ${ai.n_enriched} enriched`}
                  accent
                />
                <KpiCard
                  value={`${ai.ai_skills_pct}%`}
                  label="AI skills required"
                  sub={`${ai.n_ai_skills} of ${ai.n_enriched} enriched`}
                />
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
            ? `${companies.n_companies} unique companies hiring. Top 10 account for ${companies.top10_pct}% of open roles.`
            : 'Companies with active PM openings.'
        }
      >
        {companies.top20.length > 0 ? (
          <Card>
            <div className="flex gap-8 mb-5">
              <div>
                <p className="text-2xl font-bold text-white">{companies.n_companies}</p>
                <p className="text-xs text-muted mt-0.5">unique companies</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{companies.multi_hiring}</p>
                <p className="text-xs text-muted mt-0.5">hiring 2+ roles</p>
              </div>
              {companies.top10_pct > 0 && (
                <div>
                  <p className="text-2xl font-bold text-white">{companies.top10_pct}%</p>
                  <p className="text-xs text-muted mt-0.5">share from top 10</p>
                </div>
              )}
            </div>
            <div className="border-t border-border pt-4">
              <p className="text-xs text-muted mb-3 uppercase tracking-wider">Top companies</p>
              <div className="space-y-2">
                {companies.top20.slice(0, 12).map((c) => (
                  <div key={c.label} className="flex items-center justify-between gap-2">
                    <span className="text-sm text-white truncate">{c.label}</span>
                    <span className="text-sm text-muted shrink-0">{c.count} open</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        ) : (
          <EmptyState message="Company data is building up." />
        )}
      </Section>

      <Section
        title="Data sources"
        description="Breakdown of active roles by source."
      >
        {source.length > 0 ? (
          <Card>
            <StatBar items={source} showPct />
          </Card>
        ) : (
          <EmptyState message="Source data unavailable." />
        )}
      </Section>
    </>
  )
}
