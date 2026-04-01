import { getDistributions, getOverview, getExperience, getJobs } from '@/lib/data'
import MarketClient from './market-client'

export default function MarketPage() {
  const dist = getDistributions()
  const overview = getOverview()
  const experience = getExperience()
  const jobs = getJobs()

  return <MarketClient dist={dist} overview={overview} experience={experience} jobs={jobs} />
}
