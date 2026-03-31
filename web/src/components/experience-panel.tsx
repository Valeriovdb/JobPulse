'use client'

import { useEffect, useRef } from 'react'
import type { ExperienceJob } from '@/types/data'

const LEVEL_LABELS: Record<string, string> = {
  required: 'Required',
  preferred: 'Preferred',
  not_clear: 'Mentioned',
}

const LEVEL_COLORS: Record<string, string> = {
  required: 'text-positive',
  preferred: 'text-accent',
  not_clear: 'text-muted',
}

interface ExperiencePanelProps {
  tag: string
  tagLabel: string
  jobs: ExperienceJob[]
  onClose: () => void
}

export function ExperiencePanel({ tag, tagLabel, jobs, onClose }: ExperiencePanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('keydown', handleEsc)
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('keydown', handleEsc)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Panel */}
      <div
        ref={panelRef}
        className="relative w-full max-w-lg bg-bg border-l border-border overflow-y-auto animate-slide-in"
      >
        {/* Header */}
        <div className="sticky top-0 bg-bg/95 backdrop-blur-sm border-b border-border px-6 py-4 flex items-start justify-between gap-4 z-10">
          <div>
            <p className="text-2xs text-subtle uppercase tracking-widest mb-1">
              Required experience
            </p>
            <h2 className="text-base font-semibold text-white leading-snug">
              Jobs mentioning {tagLabel.toLowerCase()} experience
            </h2>
            <p className="text-xs text-muted mt-1">
              {jobs.length} {jobs.length === 1 ? 'role' : 'roles'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-muted hover:text-white transition-colors p-1 -mr-1 shrink-0"
            aria-label="Close panel"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path
                d="M5 5L15 15M15 5L5 15"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* Job list */}
        <div className="px-6 py-4 space-y-1">
          {jobs.map((job) => (
            <div
              key={job.job_id}
              className="border-b border-border py-4 last:border-b-0"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {job.url ? (
                    <a
                      href={job.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-white hover:text-accent transition-colors leading-snug block truncate"
                    >
                      {job.title || 'Untitled role'}
                    </a>
                  ) : (
                    <p className="text-sm font-medium text-white leading-snug truncate">
                      {job.title || 'Untitled role'}
                    </p>
                  )}
                  <p className="text-xs text-muted mt-0.5">{job.company || 'Unknown company'}</p>
                </div>
                <span
                  className={`text-2xs shrink-0 mt-0.5 ${LEVEL_COLORS[job.level] ?? 'text-muted'}`}
                >
                  {LEVEL_LABELS[job.level] ?? job.level}
                </span>
              </div>

              {/* Evidence snippet */}
              {job.evidence && (
                <p className="text-xs text-subtle mt-2 leading-relaxed italic">
                  &ldquo;{job.evidence}&rdquo;
                </p>
              )}
            </div>
          ))}
        </div>

        {jobs.length === 0 && (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-muted">No matching jobs found.</p>
          </div>
        )}
      </div>
    </div>
  )
}
