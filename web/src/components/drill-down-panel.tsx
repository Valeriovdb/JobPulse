'use client'

import { useEffect, useState, useCallback } from 'react'
import type { FilterState } from '@/components/filter-bar'

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
  company_name: string | null
  location_normalized: string | null
  canonical_url: string | null
}

interface DrillDownPanelProps {
  target: DrillTarget | null
  apiParams: { chart_id: string; segment_key: string } | null
  filters: FilterState
  onClose: () => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SENIORITY_API_MAP: Record<string, string> = {
  junior: 'junior',
  mid: 'mid',
  senior: 'senior,mid_senior',
  lead: 'lead,staff,group,principal,head',
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

  // Seniority filter — skip when drilling by seniority (would conflict)
  if (filters.seniority !== 'all' && apiParams.chart_id !== 'seniority') {
    const mapped = SENIORITY_API_MAP[filters.seniority]
    if (mapped) params.set('seniority', mapped)
  }

  // Time filter
  if (filters.time !== 'all') {
    const days = filters.time === '7d' ? 7 : 30
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)
    params.set('date_from', cutoff.toISOString().split('T')[0])
  }

  return `/api/jobs/drilldown?${params.toString()}`
}

function buildFilterSummary(filters: FilterState, chartId: string): string | null {
  const parts: string[] = []

  if (filters.seniority !== 'all' && chartId !== 'seniority') {
    const labels: Record<string, string> = {
      junior: 'Junior', mid: 'Mid', senior: 'Senior', lead: 'Lead+',
    }
    parts.push(labels[filters.seniority] ?? filters.seniority)
  }

  if (filters.time !== 'all') {
    parts.push(filters.time === '7d' ? 'Last 7 days' : 'Last 30 days')
  }

  return parts.length > 0 ? parts.join(' · ') : null
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

  // Close on Escape
  useEffect(() => {
    if (!target) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [target, onClose])

  // Fetch initial page when apiParams or filters change
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
      .catch(() => {
        if (!cancelled) setStatus('error')
      })

    return () => { cancelled = true }
  }, [apiParams, filters])

  const loadMore = useCallback(() => {
    if (!apiParams || loadingMore) return
    setLoadingMore(true)
    const nextOffset = jobs.length

    fetch(buildApiUrl(apiParams, filters, nextOffset))
      .then((r) => r.json())
      .then((data) => {
        setJobs((prev) => [...prev, ...(data.jobs ?? [])])
        setLoadingMore(false)
      })
      .catch(() => setLoadingMore(false))
  }, [apiParams, filters, jobs.length, loadingMore])

  const isOpen = target !== null && apiParams !== null
  const filterSummary = apiParams ? buildFilterSummary(filters, apiParams.chart_id) : null

  return (
    <div
      className={[
        'fixed inset-y-0 right-0 z-50 w-80 flex flex-col',
        'bg-[#0f0f0f] border-l border-border shadow-2xl',
        'transition-transform duration-200 ease-out',
        isOpen ? 'translate-x-0' : 'translate-x-full',
      ].join(' ')}
    >
      {/* Header */}
      <div className="flex items-start justify-between px-5 py-4 border-b border-border shrink-0">
        <div className="min-w-0 pr-4">
          <p className="text-sm font-medium text-white truncate">{target?.label ?? ''}</p>
          {filterSummary && (
            <p className="text-2xs text-subtle mt-0.5">{filterSummary}</p>
          )}
        </div>
        <button
          onClick={onClose}
          className="shrink-0 w-6 h-6 flex items-center justify-center rounded text-subtle hover:text-white hover:bg-surface-elevated transition-colors text-xs mt-0.5"
          aria-label="Close panel"
        >
          ✕
        </button>
      </div>

      {/* Count */}
      {status === 'loaded' && (
        <div className="px-5 pt-3 pb-1 shrink-0">
          <span className="text-2xs text-subtle uppercase tracking-wider">
            {total} role{total !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 pb-4">
        {status === 'loading' && (
          <div className="flex justify-center mt-8">
            <div className="w-5 h-5 rounded-full border-2 border-border border-t-white/60 animate-spin" />
          </div>
        )}

        {status === 'error' && (
          <p className="text-xs text-subtle mt-6 leading-relaxed">
            Couldn&apos;t load jobs. Try again.
          </p>
        )}

        {status === 'loaded' && jobs.length === 0 && (
          <p className="text-xs text-subtle mt-6 leading-relaxed">
            No jobs match this selection.
          </p>
        )}

        {status === 'loaded' && jobs.length > 0 && (
          <ul className="divide-y divide-border">
            {jobs.map((job) => (
              <li key={job.job_id} className="py-3">
                {job.canonical_url ? (
                  <a
                    href={job.canonical_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-white/90 hover:text-white leading-snug block transition-colors"
                  >
                    {job.title || 'Untitled role'}
                  </a>
                ) : (
                  <span className="text-sm text-white/90 leading-snug block">
                    {job.title || 'Untitled role'}
                  </span>
                )}
                <p className="text-xs text-subtle mt-0.5">
                  {[job.company_name, job.location_normalized].filter(Boolean).join(' · ')}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Footer */}
      {isOpen && (
        <div className="shrink-0 px-5 pb-5 border-t border-border pt-3 space-y-3">
          {status === 'loaded' && jobs.length < total && (
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="w-full py-2 text-xs text-subtle border border-border rounded-lg hover:border-border-strong hover:text-white transition-colors disabled:opacity-50"
            >
              {loadingMore ? 'Loading…' : `Load more (${total - jobs.length} remaining)`}
            </button>
          )}
          <p className="text-2xs text-subtle/60">Results based on extracted job data</p>
        </div>
      )}
    </div>
  )
}
