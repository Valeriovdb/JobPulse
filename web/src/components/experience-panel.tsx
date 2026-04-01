'use client'

import { SidePanel } from '@/components/side-panel'
import type { ExperienceJob } from '@/types/data'

// ---------------------------------------------------------------------------
// Label maps
// ---------------------------------------------------------------------------

const LEVEL_LABELS: Record<string, string> = {
  required: 'Required',
  preferred: 'Preferred',
  not_clear: 'Mentioned',
}

const LEVEL_STYLES: Record<string, string> = {
  required: 'text-[#4ade80] border-[#4ade80]/30',
  preferred: 'text-accent border-accent/30',
  not_clear: 'text-muted border-border',
}

const SENIORITY_LABELS: Record<string, string> = {
  junior: 'Junior', mid: 'Mid', mid_senior: 'Mid–Senior',
  senior: 'Senior', lead: 'Lead', staff: 'Staff',
  group: 'Group PM', principal: 'Principal', head: 'Head of Product',
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExperiencePanelProps {
  isOpen: boolean
  tagLabel: string
  jobs: ExperienceJob[]
  onClose: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ExperiencePanel({ isOpen, tagLabel, jobs, onClose }: ExperiencePanelProps) {
  // Group jobs by company
  const grouped = buildCompanyGroups(jobs)

  const subtitle = jobs.length > 0
    ? `${jobs.length} role${jobs.length !== 1 ? 's' : ''} · ${grouped.length} compan${grouped.length !== 1 ? 'ies' : 'y'}`
    : undefined

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={`${tagLabel} experience`}
      subtitle={subtitle}
    >
      {jobs.length === 0 ? (
        <p className="px-5 pt-8 text-sm text-muted">No matching jobs found.</p>
      ) : (
        <div className="px-4 py-5 space-y-3">
          {grouped.map(({ company, jobs: companyJobs }) => (
            <div key={company} className="rounded-xl border border-border overflow-hidden bg-surface">
              {/* Company header */}
              <div className="px-4 pt-4 pb-3 flex items-baseline justify-between gap-3 border-b border-border">
                <span className="text-[15px] font-semibold text-white leading-snug">{company}</span>
                {companyJobs.length > 1 && (
                  <span className="shrink-0 text-2xs font-medium text-muted bg-white/[0.06] px-2 py-0.5 rounded-full tabular-nums">
                    {companyJobs.length}
                  </span>
                )}
              </div>

              {/* Roles */}
              <div className="divide-y divide-border">
                {companyJobs.map((job) => (
                  <ExperienceJobRow key={job.job_id} job={job} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </SidePanel>
  )
}

// ---------------------------------------------------------------------------
// Job row
// ---------------------------------------------------------------------------

function ExperienceJobRow({ job }: { job: ExperienceJob }) {
  const seniority = job.seniority ? (SENIORITY_LABELS[job.seniority] ?? null) : null
  const levelLabel = LEVEL_LABELS[job.level] ?? job.level
  const levelStyle = LEVEL_STYLES[job.level] ?? LEVEL_STYLES.not_clear

  const content = (
    <div className="px-4 py-3 transition-colors group-hover:bg-white/[0.025]">
      <p className="text-sm font-medium text-white/85 leading-snug">
        {job.title || 'Untitled role'}
      </p>
      <div className="flex flex-wrap gap-1.5 mt-2">
        {seniority && (
          <span className="text-2xs px-1.5 py-0.5 rounded border text-muted border-border">
            {seniority}
          </span>
        )}
        <span className={`text-2xs px-1.5 py-0.5 rounded border ${levelStyle}`}>
          {levelLabel}
        </span>
      </div>
      {job.evidence && (
        <p className="mt-2.5 text-xs text-subtle leading-relaxed italic">
          &ldquo;{job.evidence}&rdquo;
        </p>
      )}
    </div>
  )

  if (job.url) {
    return (
      <a
        href={job.url}
        target="_blank"
        rel="noopener noreferrer"
        className="group block"
      >
        {content}
      </a>
    )
  }

  return <div className="group">{content}</div>
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildCompanyGroups(jobs: ExperienceJob[]): { company: string; jobs: ExperienceJob[] }[] {
  const map = new Map<string, ExperienceJob[]>()
  for (const job of jobs) {
    const key = job.company || 'Unknown company'
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(job)
  }
  return Array.from(map.entries()).map(([company, jobs]) => ({ company, jobs }))
}
