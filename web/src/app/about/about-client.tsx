'use client'

import { useState, useCallback } from 'react'
import { SidePanel } from '@/components/side-panel'
import { Section, Card } from '@/components/section'

type PanelKey = 'sources' | 'classification' | 'methodology'

interface AboutClientProps {
  lastUpdated: string
  scope: string
  roleType: string
}

function PanelLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="text-xs text-muted underline underline-offset-2 decoration-border hover:text-white hover:decoration-muted transition-colors"
    >
      {children}
    </button>
  )
}

function SourcesContent() {
  return (
    <div className="px-5 py-5 space-y-6">
      <div className="space-y-1.5">
        <p className="text-sm font-semibold text-white">JSearch via RapidAPI</p>
        <p className="text-sm text-muted leading-relaxed">
          Aggregates postings from LinkedIn, Indeed, Glassdoor, and others. Queried daily
          with targeted searches for Berlin and remote Germany PM roles.
        </p>
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-semibold text-white">Arbeitnow</p>
        <p className="text-sm text-muted leading-relaxed">
          A Germany-focused job board with strong coverage of Berlin tech companies —
          particularly useful for roles posted in German.
        </p>
      </div>
      <div className="pt-4 border-t border-border space-y-1.5">
        <p className="text-xs text-subtle uppercase tracking-widest">Why two sources</p>
        <p className="text-sm text-muted leading-relaxed">
          Different boards have uneven coverage of the German market. Combining them
          reduces blind spots without significantly inflating duplicates — deduplication
          runs on a stable job key before the data reaches the dashboard.
        </p>
      </div>
      <div className="space-y-1.5">
        <p className="text-xs text-subtle uppercase tracking-widest">Coverage note</p>
        <p className="text-sm text-muted leading-relaxed">
          This is a directional sample, not an exhaustive list. Roles posted only on
          company career pages or niche boards won't appear.
        </p>
      </div>
    </div>
  )
}

function ClassificationContent() {
  return (
    <div className="px-5 py-5 space-y-6">
      <div className="space-y-3">
        <p className="text-xs text-subtle uppercase tracking-widest">Extracted by rules</p>
        <ul className="space-y-2">
          {[
            'Seniority level — inferred from job title patterns',
            'Work mode — on-site, hybrid, or remote, from description keywords',
          ].map((item) => (
            <li key={item} className="flex gap-2 text-sm text-muted">
              <span className="text-accent shrink-0">·</span>
              {item}
            </li>
          ))}
        </ul>
      </div>
      <div className="space-y-3">
        <p className="text-xs text-subtle uppercase tracking-widest">Inferred from job descriptions</p>
        <ul className="space-y-2">
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
      </div>
      <div className="pt-4 border-t border-border space-y-1.5">
        <p className="text-xs text-subtle uppercase tracking-widest">Why this is needed</p>
        <p className="text-sm text-muted leading-relaxed">
          Raw job titles carry very little signal. Extracting these dimensions from the
          full description is what makes the distributions on the dashboard meaningful —
          and what allows filtering by language requirement, role type, or AI focus.
        </p>
      </div>
    </div>
  )
}

function MethodologyContent() {
  return (
    <div className="px-5 py-5 space-y-6">
      <div className="space-y-1.5">
        <p className="text-xs text-subtle uppercase tracking-widest">Source dependency</p>
        <p className="text-sm text-muted leading-relaxed">
          Coverage reflects what's posted on the boards we query. Roles published only
          on company websites or niche boards won't appear, so the count understates
          total market activity.
        </p>
      </div>
      <div className="space-y-1.5">
        <p className="text-xs text-subtle uppercase tracking-widest">Classification accuracy</p>
        <p className="text-sm text-muted leading-relaxed">
          The classifier reads full descriptions and is generally accurate, but short
          or ambiguous listings occasionally produce incorrect labels — particularly
          around seniority and role type.
        </p>
      </div>
      <div className="space-y-1.5">
        <p className="text-xs text-subtle uppercase tracking-widest">Trend reliability</p>
        <p className="text-sm text-muted leading-relaxed">
          Distribution snapshots stabilize over time. Early readings are directional
          signals — not settled baselines. The longer the data accumulates, the more
          confident you can be in the patterns.
        </p>
      </div>
      <div className="space-y-1.5">
        <p className="text-xs text-subtle uppercase tracking-widest">Market intent</p>
        <p className="text-sm text-muted leading-relaxed">
          The distributions reflect active postings, not total hiring demand. A company
          may post one visible role while filling others through referrals or internal
          mobility — so the visible data understates actual volume.
        </p>
      </div>
    </div>
  )
}

const PANELS: Record<PanelKey, { title: string; subtitle: string }> = {
  sources: {
    title: 'Included sources',
    subtitle: 'Where the job data comes from',
  },
  classification: {
    title: 'Classification logic',
    subtitle: 'How signals are extracted from job descriptions',
  },
  methodology: {
    title: 'Methodology notes',
    subtitle: 'What to keep in mind when reading the data',
  },
}

export function AboutClient({ lastUpdated, scope, roleType }: AboutClientProps) {
  const [openPanel, setOpenPanel] = useState<PanelKey | null>(null)
  const close = useCallback(() => setOpenPanel(null), [])

  return (
    <>
      <div className="pt-2 pb-2">
        <h1 className="text-2xl font-bold tracking-tight text-white">About</h1>
        <p className="text-muted mt-1.5 text-sm max-w-xl">
          What JobPulse tracks, how it works, and what the data represents.
        </p>
      </div>

      <Section title="What this is">
        <Card>
          <p className="text-sm text-white leading-relaxed">
            JobPulse turns scattered product job postings into a readable view of the market.
            Built in collaboration with a Berlin product community, it focuses on Product
            Management roles in Germany — with an emphasis on Berlin and remote roles open to
            Germany-based candidates. The pipeline runs daily.
          </p>
          <p className="text-sm text-muted leading-relaxed mt-3">
            The goal is directional signal — a clear picture of what the PM market actually
            looks like right now, not a perfect census of every open role.
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
          <div className="mt-4 pt-3 border-t border-border">
            <PanelLink onClick={() => setOpenPanel('sources')}>See included sources →</PanelLink>
          </div>
        </Card>
      </Section>

      <Section title="What it tracks">
        <Card>
          <p className="text-sm text-white leading-relaxed">
            The dashboard surfaces patterns across seniority levels, German language requirements,
            role types, work mode, company concentration, and how quickly postings disappear.
            These signals are extracted from job descriptions — some through rules, some through
            classification — and aggregated into the distributions shown on the market tab.
          </p>
          <div className="mt-4 pt-3 border-t border-border">
            <PanelLink onClick={() => setOpenPanel('classification')}>See classification logic →</PanelLink>
          </div>
        </Card>
      </Section>

      <Section title="What to keep in mind">
        <Card>
          <p className="text-sm text-muted leading-relaxed">
            This is a directional view of the market, not a complete census. Coverage depends on
            which boards are queried, so some roles won't appear. Classification is accurate but not
            perfect, and trend readings become more reliable the longer data accumulates.
          </p>
          <div className="mt-4 pt-3 border-t border-border">
            <PanelLink onClick={() => setOpenPanel('methodology')}>See methodology notes →</PanelLink>
          </div>
        </Card>
      </Section>

      <div className="mt-12 pt-6 border-t border-border flex flex-col gap-3">
        <p className="text-2xs text-muted">
          Last data refresh: {lastUpdated} · Scope: {scope} · Role type: {roleType}
        </p>
        <p className="text-xs text-muted">
          For feedback, collaboration, or PM opportunities,{' '}
          <a
            href="https://www.linkedin.com/in/valeriovandenbroek/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 decoration-border hover:text-white hover:decoration-muted transition-colors"
          >
            connect with me on LinkedIn
          </a>
          .
        </p>
      </div>

      {openPanel && (
        <SidePanel
          isOpen={true}
          onClose={close}
          title={PANELS[openPanel].title}
          subtitle={PANELS[openPanel].subtitle}
        >
          {openPanel === 'sources' && <SourcesContent />}
          {openPanel === 'classification' && <ClassificationContent />}
          {openPanel === 'methodology' && <MethodologyContent />}
        </SidePanel>
      )}
    </>
  )
}
