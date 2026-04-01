import { getMetadata, formatDate } from '@/lib/data'
import { AboutClient } from './about-client'

export default function AboutPage() {
  const meta = getMetadata()

  return (
    <AboutClient
      lastUpdated={formatDate(meta.last_updated)}
      scope={meta.scope}
      roleType={meta.role_type}
    />
  )
}
