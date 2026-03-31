'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const LINKS = [
  { href: '/', label: 'Overview' },
  { href: '/market', label: 'Market' },
  { href: '/trends', label: 'Trends' },
  { href: '/about', label: 'About' },
]

interface NavProps {
  lastUpdated: string
}

function formatUpdated(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso + 'T00:00:00Z')
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

export function Nav({ lastUpdated }: NavProps) {
  const pathname = usePathname()

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-bg/90 backdrop-blur-sm">
      <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between gap-8">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <span className="w-2 h-2 rounded-full bg-positive" />
          <span className="font-semibold text-sm tracking-tight text-white">JobPulse</span>
        </Link>

        <nav className="flex items-center gap-1">
          {LINKS.map(({ href, label }) => {
            const active = pathname === href
            return (
              <Link
                key={href}
                href={href}
                className={[
                  'px-3 py-1.5 rounded-md text-sm transition-colors',
                  active
                    ? 'text-white bg-surface-elevated'
                    : 'text-muted hover:text-white hover:bg-surface',
                ].join(' ')}
              >
                {label}
              </Link>
            )
          })}
        </nav>

        {lastUpdated && (
          <span className="text-2xs text-muted shrink-0 hidden sm:block">
            Last refresh: {formatUpdated(lastUpdated)}
          </span>
        )}
      </div>
    </header>
  )
}
