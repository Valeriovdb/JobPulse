import { getDistributions } from '@/lib/data'
import BreakdownClient from './market-client'

export default function MarketPage() {
  const dist = getDistributions()
  return <BreakdownClient dist={dist} />
}
