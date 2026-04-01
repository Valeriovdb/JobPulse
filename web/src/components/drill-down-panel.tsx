'use client'

import { useEffect } from 'react'
import type { Job } from '@/types/data'

export interface DrillTarget {
  dimension: string
  keys: string[]
  label: string
}

interface DrillDownPanelProps {
  target: DrillTarget | null
  jobs: Job[]
  onClose: () => void
}

export function DrillDownPanel({ target, jobs, onClose }: DrillDownPanelProps) {
  // Close on Escape
  useEffect(() => {
    if (!target) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [target, onClose])

  return (
    <div
      className={[
        'fixed inset-y-0 right-0 z-50 w-80 flex flex-col',
        'bg-[#0f0f0f] border-l border-border shadow-2xl',
        'transition-transform duration-200 ease-out',
        target ? 'translate-x-0' : 'translate-x-full',
      ].join(' ')}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
        <span className="text-sm font-medium text-white truncate pr-4">{target?.label ?? ''}</span>
        <button
          onClick={onClose}
          className="shrink-0 w-6 h-6 flex items-center justify-center rounded text-subtle hover:text-white hover:bg-surface-elevated transition-colors text-xs"
          aria-label="Close panel"
        >
          ✕
        </button>
      </div>

      {/* Count */}
      {target && (
        <div className="px-5 pt-3 pb-1 shrink-0">
          <span className="text-2xs text-subtle uppercase tracking-wider">
            {jobs.length} role{jobs.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* Job list */}
      <div className="flex-1 overflow-y-auto px-5 pb-8">
        {!target ? null : jobs.length === 0 ? (
          <p className="text-xs text-subtle mt-4 leading-relaxed">
            No job-level data available for drill-down yet.
            Run the pipeline with job export enabled.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {jobs.map((job) => (
              <li key={job.id} className="py-3">
                {job.url ? (
                  <a
                    href={job.url}
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
                {job.company && (
                  <p className="text-xs text-subtle mt-0.5">{job.company}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
