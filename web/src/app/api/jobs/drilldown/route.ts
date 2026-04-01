import { NextResponse } from 'next/server'
import {
  queryDrilldown,
  DrilldownValidationError,
  type DrilldownFilters,
} from '@/lib/drilldown'

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)

  // --- required params ---
  const chart_id = searchParams.get('chart_id')
  const segment_key = searchParams.get('segment_key')

  if (!chart_id || !segment_key) {
    return NextResponse.json(
      { error: 'chart_id and segment_key are required' },
      { status: 400 },
    )
  }

  // --- pagination ---
  const rawLimit = parseInt(searchParams.get('limit') ?? String(DEFAULT_LIMIT), 10)
  const rawOffset = parseInt(searchParams.get('offset') ?? '0', 10)
  const limit = Math.min(Math.max(isNaN(rawLimit) ? DEFAULT_LIMIT : rawLimit, 1), MAX_LIMIT)
  const offset = Math.max(isNaN(rawOffset) ? 0 : rawOffset, 0)

  // --- optional filters ---
  const seniorityParam = searchParams.get('seniority')
  const germanReqParam = searchParams.get('german_requirement')
  const workModeParam = searchParams.get('work_mode')
  const dateFrom = searchParams.get('date_from') ?? undefined
  const dateTo = searchParams.get('date_to') ?? undefined

  const filters: DrilldownFilters = {
    seniority: seniorityParam ? seniorityParam.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
    german_requirement: germanReqParam ?? undefined,
    work_mode: workModeParam ? workModeParam.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
    date_from: dateFrom,
    date_to: dateTo,
  }

  try {
    const result = await queryDrilldown(chart_id, segment_key, filters, limit, offset)

    return NextResponse.json({
      meta: {
        chart_id,
        segment_key,
        total_jobs: result.total_jobs,
        applied_filters: {
          seniority: filters.seniority ?? null,
          german_requirement: filters.german_requirement ?? null,
          work_mode: filters.work_mode ?? null,
          date_from: filters.date_from ?? null,
          date_to: filters.date_to ?? null,
        },
      },
      jobs: result.jobs,
    })
  } catch (err) {
    if (err instanceof DrilldownValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    console.error('[drilldown] query error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
