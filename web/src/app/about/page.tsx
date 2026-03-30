import { getMetadata, formatDate } from '@/lib/data'
import { Section, Card } from '@/components/section'

export default function AboutPage() {
  const meta = getMetadata()

  return (
    <>
      <div className="pt-2 pb-2">
        <h1 className="text-2xl font-bold tracking-tight text-white">About</h1>
        <p className="text-muted mt-1.5 text-sm max-w-xl">
          How JobPulse works, what it tracks, and what to keep in mind when reading the data.
        </p>
      </div>

      <Section title="What this is">
        <Card>
          <p className="text-sm text-white leading-relaxed">
            JobPulse is a daily tracker for product management roles in Berlin and remote Germany.
            It aggregates postings from multiple job boards, classifies them using an LLM, and
            surfaces patterns that would be tedious to extract manually — language requirements,
            seniority distribution, company concentration, and how quickly roles disappear.
          </p>
          <p className="text-sm text-muted leading-relaxed mt-3">
            It was built to answer a specific question: what does the PM market in Berlin actually
            look like for someone navigating a job search? The goal is signal, not volume.
          </p>
        </Card>
      </Section>

      <Section title="Scope">
        <Card>
          <div className="space-y-3 text-sm">
            <div className="flex gap-4">
              <span className="text-muted w-32 shrink-0">Roles tracked</span>
              <span className="text-white">Product Manager, Product Owner, Head of Product, VP of Product</span>
            </div>
            <div className="flex gap-4">
              <span className="text-muted w-32 shrink-0">Locations</span>
              <span className="text-white">Berlin on-site, hybrid, and remote roles open to Germany</span>
            </div>
            <div className="flex gap-4">
              <span className="text-muted w-32 shrink-0">Excluded</span>
              <span className="text-white">Freelance, intern, student, and Werkstudent positions</span>
            </div>
            <div className="flex gap-4">
              <span className="text-muted w-32 shrink-0">Cadence</span>
              <span className="text-white">Daily — pipeline runs each morning</span>
            </div>
          </div>
        </Card>
      </Section>

      <Section title="Data sources">
        <div className="grid sm:grid-cols-2 gap-3">
          <Card>
            <p className="text-sm font-semibold text-white">JSearch via RapidAPI</p>
            <p className="text-sm text-muted mt-2 leading-relaxed">
              Aggregates postings from LinkedIn, Indeed, Glassdoor, and others. Queried daily
              with targeted searches for Berlin and remote Germany PM roles.
            </p>
          </Card>
          <Card>
            <p className="text-sm font-semibold text-white">Arbeitnow</p>
            <p className="text-sm text-muted mt-2 leading-relaxed">
              Germany-focused job board with strong coverage of Berlin tech companies.
              Particularly useful for roles posted in German.
            </p>
          </Card>
        </div>
      </Section>

      <Section title="How classification works">
        <Card>
          <p className="text-sm text-white leading-relaxed">
            Each job is passed through a GPT-4o-mini classifier that reads the full job description and extracts:
          </p>
          <ul className="mt-3 space-y-1.5">
            {[
              'German language requirement (must / plus / not mentioned)',
              'PM role type (Core, Technical, Growth, Data, Other)',
              'Industry vertical (11 categories)',
              'AI focus and AI skills signals',
              'B2B SaaS indicator',
            ].map((item) => (
              <li key={item} className="flex gap-2 text-sm text-muted">
                <span className="text-accent shrink-0">·</span>
                {item}
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted leading-relaxed mt-3">
            Seniority and work mode are extracted rule-based from the job title and description before LLM enrichment.
          </p>
        </Card>
      </Section>

      <Section title="Limitations">
        <Card>
          <ul className="space-y-2">
            {[
              'Coverage depends on source availability. Not every Berlin PM role appears on the boards we query.',
              'LLM classification has occasional errors, especially for ambiguous titles or short job descriptions.',
              'The seniority distribution reflects what\'s visible on boards — it does not represent total hiring intent.',
              'Market patterns are more reliable after several weeks of tracking.',
            ].map((item) => (
              <li key={item} className="flex gap-2 text-sm text-muted">
                <span className="text-warning shrink-0">·</span>
                {item}
              </li>
            ))}
          </ul>
        </Card>
      </Section>

      <div className="mt-10 pt-6 border-t border-border">
        <p className="text-2xs text-muted">
          Last data refresh: {formatDate(meta.last_updated)} · Scope: {meta.scope} · Role type: {meta.role_type}
        </p>
      </div>
    </>
  )
}
