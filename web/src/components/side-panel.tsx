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
        <div className="shrink-0 bg-[#0f0f0f] border-b border-border px-5 py-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-white leading-snug">{title}</h2>
            {subtitle && (
              <p className="text-xs text-muted mt-1">{subtitle}</p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close panel"
            className="shrink-0 mt-0.5 w-7 h-7 flex items-center justify-center rounded-md text-muted hover:text-white hover:bg-white/[0.07] transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path
                d="M2.5 2.5L11.5 11.5M11.5 2.5L2.5 11.5"
                stroke="currentColor"
                strokeWidth="1.5"
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
