interface SectionProps {
  title: string
  description?: string
  meta?: string
  children: React.ReactNode
  className?: string
  compact?: boolean
}

export function Section({ title, description, meta, children, className, compact }: SectionProps) {
  return (
    <section className={[compact ? 'mt-8' : 'mt-14', className].filter(Boolean).join(' ')}>
      <div className="mb-4">
        <p className="text-2xs text-subtle uppercase tracking-widest mb-2">{title}</p>
        {description && (
          <p className="text-sm text-white font-medium leading-relaxed">{description}</p>
        )}
        {meta && (
          <p className="text-xs text-subtle mt-1.5">{meta}</p>
        )}
      </div>
      {children}
    </section>
  )
}

interface BlockHeadingProps {
  title: string
  description?: string
  className?: string
}

export function BlockHeading({ title, description, className }: BlockHeadingProps) {
  return (
    <div className={['pt-16 pb-2 border-t border-border', className].filter(Boolean).join(' ')}>
      <h2 className="text-lg font-semibold tracking-tight text-white">{title}</h2>
      {description && (
        <p className="text-sm text-muted mt-1 max-w-lg leading-relaxed">{description}</p>
      )}
    </div>
  )
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={['bg-surface border border-border rounded-xl p-5', className].filter(Boolean).join(' ')}>
      {children}
    </div>
  )
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-8 text-center">
      <p className="text-muted text-sm">{message}</p>
    </div>
  )
}
