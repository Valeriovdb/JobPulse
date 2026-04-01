'use client'

import { useState, useMemo } from 'react'
import type { Timeseries, MarketActivityRow } from '@/types/data'
import { Section, Card, EmptyState } from '@/components/section'
import { TrendChart } from '@/components/charts/trend-chart'
import { StackedArea } from '@/components/charts/stacked-area'
import { MarketActivityChart } from '@/components/charts/market-activity-chart'
import { FilterBar, DEFAULT_FILTERS, type FilterState } from '@/components/filter-bar'

const MIN_DAYS = 7

interface TrendsClientProps {
  timeseries: Timeseries
}

export default function TrendsClient({ timeseries }: TrendsClientProps) {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS)

  const filteredMarketActivity = useMemo(() => {
    if (!timeseries.market_activity) return []

    let filtered = timeseries.market_activity

    // 1. Time filter
    if (filters.time !== 'all') {
      const days = filters.time === '7d' ? 7 : 30
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - days)
      const cutoffStr = cutoff.toISOString().split('T')[0]
      filtered = filtered.filter((row) => row.date >= cutoffStr)
    }

    // 2. Location filter
    if (filters.location !== 'all') {
      const target = filters.location === 'berlin' ? 'berlin' : 'remote_germany'
      filtered = filtered.filter((row) => row.location === target)
    }

    // 3. Seniority filter
    if (filters.seniority !== 'all') {
      const map: Record<string, string[]> = {
        junior: ['junior'],
        mid: ['mid'],
        senior: ['senior', 'mid_senior'],
        lead: ['lead', 'staff', 'group', 'principal', 'head'],
      }
      const targets = new Set(map[filters.seniority] ?? [])
      filtered = filtered.filter((row) => targets.has(row.seniority))
    }

    // 4. Language filter
    if (filters.language !== 'all') {
      if (filters.language === 'en_only') {
        filtered = filtered.filter((row) => row.language === 'en' && row.german_req === 'not_mentioned')
      } else if (filters.language === 'en_plus') {
        filtered = filtered.filter((row) => row.german_req === 'plus')
      } else if (filters.language === 'de_required') {
        filtered = filtered.filter((row) => row.german_req === 'must' || row.language === 'de')
      }
    }

    // 5. Aggregate by date
    const grouped = filtered.reduce((acc, row) => {
      if (!acc[row.date]) {
        acc[row.date] = { date: row.date, active_jobs: 0, jobs_added: 0, jobs_removed: 0, net_change: 0 }
      }
      acc[row.date].active_jobs += row.active_jobs
      acc[row.date].jobs_added += row.jobs_added
      acc[row.date].jobs_removed += row.jobs_removed
      return acc
    }, {} as Record<string, any>)

    return Object.values(grouped)
      .map(d => ({ ...d, net_change: d.jobs_added - d.jobs_removed }))
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [timeseries.market_activity, filters])

  // Simple aggregations for the other legacy charts if no filters applied
  // In a real app, we'd probably want to filter them too, but the prompt focuses on the new chart.
  // Let's at least respect the time filter for the legacy charts.
  const filteredNewPerDay = useMemo(() => {
    let data = timeseries.new_per_day
    if (filters.time !== 'all') {
      const days = filters.time === '7d' ? 7 : 30
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - days)
      const cutoffStr = cutoff.toISOString().split('T')[0]
      data = data.filter(d => d.date >= cutoffStr)
    }
    return data
  }, [timeseries.new_per_day, filters.time])

  const filteredActivePerDay = useMemo(() => {
    // If market activity is available, we can derive a filtered active_per_day from it
    if (filteredMarketActivity.length > 0) {
      return filteredMarketActivity.map(d => ({ date: d.date, count: d.active_jobs }))
    }
    
    let data = timeseries.active_per_day
    if (filters.time !== 'all') {
      const days = filters.time === '7d' ? 7 : 30
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - days)
      const cutoffStr = cutoff.toISOString().split('T')[0]
      data = data.filter(d => d.date >= cutoffStr)
    }
    return data
  }, [timeseries.active_per_day, filteredMarketActivity, filters.time])

  const daysOfHistory = filteredMarketActivity.length || timeseries.new_per_day.length
  const buildingMessage = `${daysOfHistory} day${daysOfHistory !== 1 ? 's' : ''} of data so far. Trends become meaningful after ${MIN_DAYS} days.`

  return (
    <>
      <div className="pt-2 pb-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Trends</h1>
            <p className="text-muted mt-1.5 text-sm max-w-xl">
              How the Berlin PM market is moving — volume, seniority mix, and language requirements over time.
            </p>
          </div>
          {daysOfHistory > 0 && (
            <p className="text-2xs text-muted pb-1">
              {daysOfHistory} day{daysOfHistory !== 1 ? 's' : ''} of history
            </p>
          )}
        </div>
      </div>

      <FilterBar filters={filters} onChange={setFilters} />

      <Section
        title="MARKET ACTIVITY"
        description="How the market is evolving over time"
      >
        <p className="text-xs text-muted mb-4 -mt-3 max-w-2xl">
          Active jobs show market size, while daily additions and removals explain the movement underneath.
        </p>
        {filteredMarketActivity.length >= 2 ? (
          <Card>
            <MarketActivityChart data={filteredMarketActivity} />
          </Card>
        ) : (
          <EmptyState message={buildingMessage} />
        )}
      </Section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
        <Section
          title="New roles per day"
          description="How many new PM roles entered the tracker each day."
        >
          {filteredNewPerDay.length >= 2 ? (
            <Card>
              <TrendChart data={filteredNewPerDay} showRollingAvg={filteredNewPerDay.length >= 7} />
              {filteredNewPerDay.length >= 7 && (
                <p className="text-2xs text-muted mt-3">Orange dashed = 7-day rolling average</p>
              )}
            </Card>
          ) : (
            <EmptyState message={buildingMessage} />
          )}
        </Section>

        <Section
          title="Active roles over time"
          description="Total active roles tracked each day."
        >
          {filteredActivePerDay.length >= 2 ? (
            <Card>
              <TrendChart data={filteredActivePerDay} color="#60a5fa" />
            </Card>
          ) : (
            <EmptyState message={buildingMessage} />
          )}
        </Section>
      </div>

      <Section
        title="Seniority mix"
        description="How the seniority composition of active roles has changed."
      >
        {timeseries.seniority_mix && timeseries.seniority_mix.dates.length >= 3 ? (
          <Card>
            <StackedArea
              dates={timeseries.seniority_mix.dates}
              series={timeseries.seniority_mix.series}
            />
          </Card>
        ) : (
          <EmptyState message={buildingMessage} />
        )}
      </Section>

      <Section
        title="German requirement over time"
        description="Trend in language requirements across active roles."
      >
        {timeseries.german_req_mix && timeseries.german_req_mix.dates.length >= 3 ? (
          <Card>
            <StackedArea
              dates={timeseries.german_req_mix.dates}
              series={timeseries.german_req_mix.series}
            />
          </Card>
        ) : (
          <EmptyState message={buildingMessage} />
        )}
      </Section>
    </>
  )
}
