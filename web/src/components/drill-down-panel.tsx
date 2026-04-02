'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import type { FilterState } from '@/components/filter-bar'
import { SidePanel } from '@/components/side-panel'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DrillTarget {
  dimension: string
  keys: string[]
  label: string
}

interface ApiJob {
  job_id: string
  title: string | null
  job_title_raw: string | null
  company_name: string | null
  location_normalized: string | null
  seniority: string | null
  german_requirement: string | null
  work_mode: string | null
  canonical_url: string | null
  first_seen_date: string | null
  source: string | null
}

interface DrillDownPanelProps {
  target: DrillTarget | null
  apiParams: { chart_id: string; segment_key: string } | null
  filters: FilterState
  onClose: () => void
}

// ---------------------------------------------------------------------------
// Label maps
// ---------------------------------------------------------------------------

const SENIORITY_API_MAP: Record<string, string> = {
  junior: 'junior',
  mid: 'mid',
  senior: 'senior,mid_senior',
  lead: 'lead,staff,group,principal,head',
}

const SENIORITY_LABELS: Record<string, string> = {
  junior: 'Junior', mid: 'Mid', mid_senior: 'Mid–Senior',
  senior: 'Senior', lead: 'Lead', staff: 'Staff',
  group: 'Group PM', principal: 'Principal', head: 'Head of Product',
}

// Prefixes to strip from normalized title before prepending seniority label,
// to avoid constructions like "Senior Senior Product Manager".
const SENIORITY_STRIP_PREFIXES = [
  'junior ', 'mid ', 'mid-senior ', 'mid–senior ',
  'senior ', 'lead ', 'staff ', 'principal ',
]

const SOURCE_LABELS: Record<string, string> = {
  jsearch: 'JSearch',
  arbeitnow: 'Arbeitnow',
  ats: 'ATS',
}

const LOCATION_MAP: Record<string, string> = {
  berlin: 'Berlin',
  remote_germany: 'Remote Germany',
  unclear: '',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildRoleTitle(title: string | null, seniority: string | null): string {
  const raw = title ? title.replace(/_/g, ' ') : 'Product Manager'
  // Strip any existing seniority prefix to avoid duplication
  const lower = raw.toLowerCase()
  let base = raw
  for (const prefix of SENIORITY_STRIP_PREFIXES) {
    if (lower.startsWith(prefix)) {
      base = raw.slice(prefix.length)
      break
    }
  }
  const senLabel = seniority ? (SENIORITY_LABELS[seniority] ?? null) : null
  // For multi-word seniority labels (e.g. "Group PM", "Head of Product"),
  // they become the full title rather than a prefix.
  if (senLabel) {
    if (senLabel === 'Group PM' || senLabel === 'Head of Product') {
      // Keep base if it contains more info than just "Product Manager"
      const isGeneric = base.trim().toLowerCase() === 'product manager'
      return isGeneric ? senLabel : `${senLabel} · ${base}`
    }
    return `${senLabel} ${base}`
  }
  return base
}

function formatLocation(raw: string | null): string | null {
  if (!raw) return null
  const mapped = LOCATION_MAP[raw.toLowerCase()]
  if (mapped !== undefined) return mapped || null
  return raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function getSourceLabel(source: string | null): string {
  if (!source) return 'ATS'
  return SOURCE_LABELS[source.toLowerCase()] ?? 'ATS'
}

function buildApiUrl(
  apiParams: { chart_id: string; segment_key: string },
  filters: FilterState,
  offset: number,
): string {
  const params = new URLSearchParams({
    chart_id: apiParams.chart_id,
    segment_key: apiParams.segment_key,
    limit: '50',
    offset: String(offset),
  })

  if (filters.seniority !== 'all' && apiParams.chart_id !== 'seniority') {
    const mapped = SENIORITY_API_MAP[filters.seniority]
    if (mapped) params.set('seniority', mapped)
  }

  if (filters.time !== 'all') {
    const days = filters.time === '7d' ? 7 : 30
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)
    params.set('date_from', cutoff.toISOString().split('T')[0])
  }

  return `/api/jobs/drilldown?${params.toString()}`
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type PanelStatus = 'idle' | 'loading' | 'loaded' | 'error'

export function DrillDownPanel({ target, apiParams, filters, onClose }: DrillDownPanelProps) {
  const [status, setStatus] = useState<PanelStatus>('idle')
  const [jobs, setJobs] = useState<ApiJob[]>([])
  const [total, setTotal] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)

  useEffect(() => {
    if (!apiParams) {
      setStatus('idle')
      setJobs([])
      setTotal(0)
      return
    }

    let cancelled = false
    setStatus('loading')
    setJobs([])
    setTotal(0)

    fetch(buildApiUrl(apiParams, filters, 0))
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        setJobs(data.jobs ?? [])
        setTotal(data.meta?.total_jobs ?? 0)
        setStatus('loaded')
      })
      .catch(() => { if (!cancelled) setStatus('error') })

    return () => { cancelled = true }
  }, [apiParams, filters])

  const loadMore = useCallback(() => {
    if (!apiParams || loadingMore) return
    setLoadingMore(true)
    fetch(buildApiUrl(apiParams, filters, jobs.length))
      .then((r) => r.json())
      .then((data) => {
        setJobs((prev) => [...prev, ...(data.jobs ?? [])])
        setLoadingMore(false)
      })
      .catch(() => setLoadingMore(false))
  }, [apiParams, filters, jobs.length, loadingMore])

  const grouped = useMemo(() => {
    const map = new Map<string, ApiJob[]>()
    for (const job of jobs) {
      const key = job.company_name ?? 'Unknown company'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(job)
    }
    return Array.from(map.entries()).map(([company, roles]) => ({ company, roles }))
  }, [jobs])

  const isOpen = target !== null && apiParams !== null
  const companiesCount = grouped.length
  const subtitle = status === 'loaded'
    ? `${total} role${total !== 1 ? 's' : ''} · ${companiesCount} compan${companiesCount !== 1 ? 'ies' : 'y'}`
    : undefined

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={target?.label ?? ''}
      subtitle={subtitle}
    >
      {status === 'loading' && (
        <div className="flex justify-center pt-12">
          <div className="w-5 h-5 rounded-full border-2 border-border border-t-white/60 animate-spin" />
        </div>
      )}

      {status === 'error' && (
        <p className="px-5 pt-8 text-sm text-muted">Couldn&apos;t load jobs. Try again.</p>
      )}

      {status === 'loaded' && jobs.length === 0 && (
        <p className="px-5 pt-8 text-sm text-muted">No jobs match this selection.</p>
      )}

      {status === 'loaded' && grouped.length > 0 && (
        <div className="py-3">
          <div className="divide-y divide-white/[0.06]">
            {grouped.map(({ company, roles }) => (
              <CompanyBlock key={company} company={company} roles={roles} />
            ))}
          </div>

          {jobs.length < total && (
            <div className="px-4 pt-3">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="w-full py-2.5 text-xs text-muted border border-border rounded-lg hover:border-border-strong hover:text-white transition-colors disabled:opacity-50"
              >
                {loadingMore ? 'Loading…' : `Load more (${total - jobs.length} remaining)`}
              </button>
            </div>
          )}
        </div>
      )}
    </SidePanel>
  )
}

// ---------------------------------------------------------------------------
// Company block
// ---------------------------------------------------------------------------

function CompanyBlock({ company, roles }: { company: string; roles: ApiJob[] }) {
  return (
    <div className="px-4 py-3">
      <div className="flex items-baseline gap-2 mb-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-white/40 leading-none">
          {company}
        </span>
        {roles.length > 1 && (
          <span className="text-[10px] text-subtle tabular-nums">{roles.length}</span>
        )}
      </div>
      <div>
        {roles.map((job) => (
          <JobRow key={job.job_id} job={job} />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Job row
// ---------------------------------------------------------------------------

function JobRow({ job }: { job: ApiJob }) {
  const displayTitle = job.job_title_raw ?? buildRoleTitle(job.title, job.seniority)
  const location     = formatLocation(job.location_normalized)
  const sourceLabel  = getSourceLabel(job.source)
  const daysLive     = job.first_seen_date
    ? Math.floor((Date.now() - new Date(job.first_seen_date + 'T00:00:00Z').getTime()) / 86_400_000)
    : null

  const meta = [
    location,
    daysLive !== null && daysLive >= 0 ? (daysLive === 0 ? 'today' : `${daysLive}d`) : null,
    sourceLabel,
  ].filter(Boolean).join(' · ')

  const content = (
    <div className="py-1.5 px-2 -mx-2 rounded transition-colors group-hover:bg-white/[0.05]">
      <p className="text-[13px] font-medium text-white/90 leading-snug">{displayTitle}</p>
      {meta && <p className="text-[11px] text-white/35 mt-0.5 leading-none">{meta}</p>}
    </div>
  )

  if (job.canonical_url) {
    return (
      <a
        href={job.canonical_url}
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
