import { getOverview } from '@/lib/data'
import { KpiCard, KpiGrid } from '@/components/kpi-card'
import { Section, Card } from '@/components/section'
import { StatBar } from '@/components/stat-bar'

function languageItems(lang: { en_none: number; en_plus: number; en_must: number; de: number }) {
  return [
    { label: 'No German required', count: lang.en_none, color: '#4ade80' },
    { label: 'German is a plus', count: lang.en_plus, color: '#60a5fa' },
    { label: 'German required', count: lang.en_must, color: '#818cf8' },
    { label: 'German posting', count: lang.de, color: '#737373' },
  ].filter((i) => i.count > 0)
}

function locationItems(loc: { berlin: number; remote_germany: number; unclear: number }) {
  return [
    { label: 'Berlin on-site', count: loc.berlin, color: '#818cf8' },
    { label: 'Remote Germany', count: loc.remote_germany, color: '#60a5fa' },
    { label: 'Location unclear', count: loc.unclear, color: '#404040' },
  ].filter((i) => i.count > 0)
}

function generateInsights(overview: ReturnType<typeof getOverview>): string[] {
  const insights: string[] = []
  const { accessible_pct, senior_pct, n_active, language, location } = overview

  if (accessible_pct >= 20) {
    insights.push(
      `${accessible_pct}% of active roles require no German — targeting English-first postings on JSearch is a viable entry strategy.`
    )
  } else if (accessible_pct > 0) {
    insights.push(
      `Only ${accessible_pct}% of active roles require no German. German-language fluency significantly opens up the market.`
    )
  }

  if (senior_pct >= 60) {
    insights.push(
      `${senior_pct}% of classified roles are Senior or above. Frame your experience clearly at that level — junior applications are unlikely to gain traction.`
    )
  } else if (senior_pct > 0) {
    insights.push(
      `The market shows a mix of levels (${senior_pct}% Senior+). Mid-level candidates have meaningful options here.`
    )
  }

  const remotePct = n_active > 0
    ? Math.round((location.remote_germany / n_active) * 100)
    : 0
  if (remotePct >= 15) {
    insights.push(
      `${remotePct}% of roles are explicitly remote-friendly — worth filtering for remote if Berlin office presence is not required.`
    )
  }

  if (language.de > language.en_none + language.en_plus + language.en_must) {
    insights.push(
      `More roles are posted in German than English. Set up Arbeitnow alerts in German to avoid missing the majority of the market.`
    )
  }

  return insights.slice(0, 3)
}

export default function OverviewPage() {
  const overview = getOverview()
  const { n_active, n_new_week, senior_pct, median_age_days, accessible_pct } = overview
  const insights = generateInsights(overview)

  return (
    <>
      <div className="pt-2 pb-2">
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Berlin PM Market
        </h1>
        <p className="text-muted mt-1.5 text-sm max-w-xl">
          Daily intelligence on product management roles in Berlin and remote Germany.
          Data refreshes each morning.
        </p>
      </div>

      <div className="mt-8">
        <KpiGrid>
          <KpiCard value={n_active} label="Active roles" />
          <KpiCard value={n_new_week} label="New this week" />
          <KpiCard
            value={senior_pct > 0 ? `${senior_pct}%` : '—'}
            label="Senior or above"
            sub="of classified roles"
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
            ? `${accessible_pct}% of active roles require no German — English-only fluency is viable.`
            : 'Language requirement breakdown for active roles.'
        }
      >
        <Card>
          <StatBar items={languageItems(overview.language)} showPct />
        </Card>
      </Section>

      <Section title="Where to look">
        <Card>
          <StatBar items={locationItems(overview.location)} showPct />
        </Card>
      </Section>

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
