import { getDistributions, getJobs } from '@/lib/data'
import BreakdownClient from './market-client'

export default function MarketPage() {
  const dist = getDistributions()
  const jobs = getJobs()
  return <BreakdownClient dist={dist} jobs={jobs} />
}
