import { getOverview, getDistributions, getJobs } from '@/lib/data'
import OverviewClient from './overview-client'

export default function OverviewPage() {
  const overview = getOverview()
  const dist = getDistributions()
  const jobs = getJobs()

  return <OverviewClient overview={overview} dist={dist} jobs={jobs} />
}
