import { getTimeseries } from '@/lib/data'
import { Section, Card, EmptyState } from '@/components/section'
import { TrendChart } from '@/components/charts/trend-chart'
import { StackedArea } from '@/components/charts/stacked-area'

const MIN_DAYS = 7

export default function TrendsPage() {
  const ts = getTimeseries()
  const daysOfHistory = ts.new_per_day.length
  const buildingMessage = `${daysOfHistory} day${daysOfHistory !== 1 ? 's' : ''} of data so far. Trends become meaningful after ${MIN_DAYS} days.`

  return (
    <>
      <div className="pt-2 pb-2">
        <h1 className="text-2xl font-bold tracking-tight text-white">Trends</h1>
        <p className="text-muted mt-1.5 text-sm max-w-xl">
          How the Berlin PM market is moving — volume, seniority mix, and language requirements over time.
        </p>
        {daysOfHistory > 0 && (
          <p className="text-2xs text-muted mt-1">
            {daysOfHistory} day{daysOfHistory !== 1 ? 's' : ''} of history
          </p>
        )}
      </div>

      <Section
        title="New roles per day"
        description="How many new PM roles entered the tracker each day."
      >
        {ts.new_per_day.length >= 2 ? (
          <Card>
            <TrendChart data={ts.new_per_day} showRollingAvg={ts.new_per_day.length >= 7} />
            {ts.new_per_day.length >= 7 && (
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
        {ts.active_per_day.length >= 2 ? (
          <Card>
            <TrendChart data={ts.active_per_day} color="#60a5fa" />
          </Card>
        ) : (
          <EmptyState message={buildingMessage} />
        )}
      </Section>

      <Section
        title="Seniority mix"
        description="How the seniority composition of active roles has changed."
      >
        {ts.seniority_mix && ts.seniority_mix.dates.length >= 3 ? (
          <Card>
            <StackedArea
              dates={ts.seniority_mix.dates}
              series={ts.seniority_mix.series}
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
        {ts.german_req_mix && ts.german_req_mix.dates.length >= 3 ? (
          <Card>
            <StackedArea
              dates={ts.german_req_mix.dates}
              series={ts.german_req_mix.series}
            />
          </Card>
        ) : (
          <EmptyState message={buildingMessage} />
        )}
      </Section>
    </>
  )
}
