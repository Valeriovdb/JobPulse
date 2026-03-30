import type { Metadata } from 'next'
import './globals.css'
import { Nav } from '@/components/nav'
import { getMetadata } from '@/lib/data'

export const metadata: Metadata = {
  title: 'JobPulse — Berlin PM Market',
  description: 'Daily intelligence on product management roles in Berlin and remote Germany.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const meta = getMetadata()

  return (
    <html lang="en">
      <body className="bg-bg text-white font-sans">
        <Nav lastUpdated={meta.last_updated} />
        <main className="max-w-5xl mx-auto px-6 pb-24 pt-10">
          {children}
        </main>
        <footer className="border-t border-border mt-16">
          <div className="max-w-5xl mx-auto px-6 py-6 flex items-center justify-between">
            <span className="text-muted text-xs">
              JobPulse · Berlin PM market tracker
            </span>
            <span className="text-muted text-xs">
              {meta.scope} · Refreshes daily
            </span>
          </div>
        </footer>
      </body>
    </html>
  )
}
