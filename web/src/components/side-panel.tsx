'use client'

import { useEffect } from 'react'

interface SidePanelProps {
  isOpen: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: React.ReactNode
}

export function SidePanel({ isOpen, onClose, title, subtitle, children }: SidePanelProps) {
  // Body scroll lock
  useEffect(() => {
    if (!isOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [isOpen])

  // Escape key
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      style={{ pointerEvents: isOpen ? 'auto' : 'none' }}
      aria-hidden={!isOpen}
    >
      {/* Backdrop */}
      <div
        className={[
          'absolute inset-0 bg-black/55 backdrop-blur-[3px]',
          'transition-opacity duration-200',
          isOpen ? 'opacity-100' : 'opacity-0',
        ].join(' ')}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={[
          'relative flex flex-col',
          'w-full sm:w-[40vw] sm:min-w-[400px] sm:max-w-[600px]',
          'h-full bg-[#0f0f0f] border-l border-border shadow-2xl',
          'transition-transform duration-200 ease-out',
          isOpen ? 'translate-x-0' : 'translate-x-full',
        ].join(' ')}
      >
        {/* Sticky header */}
        <div className="sticky top-0 z-10 shrink-0 bg-[#0f0f0f] border-b border-border px-5 py-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-white leading-snug">{title}</h2>
            {subtitle && (
              <p className="text-xs text-muted mt-1">{subtitle}</p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close panel"
            className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg text-white/80 hover:text-white bg-white/[0.06] hover:bg-white/[0.12] transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M3 3L13 13M13 3L3 13"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {children}
        </div>
      </div>
    </div>
  )
}
