import { getOverview, getDistributions } from '@/lib/data'
import OverviewClient from './overview-client'

export default function OverviewPage() {
  const overview = getOverview()
  const dist = getDistributions()

  return <OverviewClient overview={overview} dist={dist} />
}
