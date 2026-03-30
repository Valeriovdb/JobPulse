interface SectionProps {
  title: string
  description?: string
  meta?: string
  children: React.ReactNode
  className?: string
}

export function Section({ title, description, meta, children, className }: SectionProps) {
  return (
    <section className={['mt-12', className].filter(Boolean).join(' ')}>
      <div className="mb-5">
        <h2 className="text-base font-semibold text-white">{title}</h2>
        {description && (
          <p className="text-sm text-muted mt-1">{description}</p>
        )}
        {meta && (
          <p className="text-xs text-muted mt-1">{meta}</p>
        )}
      </div>
      {children}
    </section>
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
