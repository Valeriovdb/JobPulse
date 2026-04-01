import { getTimeseries } from '@/lib/data'
import TrendsClient from './trends-client'

export default function TrendsPage() {
  const ts = getTimeseries()

  return <TrendsClient timeseries={ts} />
}
