import { getSupabaseClient } from './supabase-server'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DrilldownFilters {
  seniority?: string[]        // raw DB values, e.g. ['senior', 'mid_senior']
  german_requirement?: string // e.g. 'not_mentioned'
  work_mode?: string[]        // raw DB values, e.g. ['remote', 'hybrid']
  date_from?: string          // ISO date string
  date_to?: string            // ISO date string
}

export interface DrilldownJob {
  job_id: string
  title: string | null
  company_name: string | null
  location_normalized: string | null
  seniority: string | null
  german_requirement: string | null
  work_mode: string | null
  canonical_url: string | null
}

export interface DrilldownResult {
  total_jobs: number
  jobs: DrilldownJob[]
}

// ---------------------------------------------------------------------------
// Allowed values (used for validation)
// ---------------------------------------------------------------------------

const GERMAN_REQ_KEYS = new Set(['not_mentioned', 'plus', 'must'])

const SENIORITY_KEYS = new Set([
  'junior', 'mid', 'mid_senior', 'senior',
  'lead', 'staff', 'group', 'principal', 'head', 'unknown',
  'senior_plus', // grouped alias
])

// senior_plus expands to these raw DB values
const SENIOR_PLUS_VALUES = ['senior', 'mid_senior', 'lead', 'staff', 'group', 'principal', 'head']

const ROLE_TYPE_KEYS = new Set([
  'core_pm', 'technical', 'customer_facing', 'platform',
  'data_ai', 'growth', 'internal_ops', 'other',
])

const SUPPORTED_CHARTS = new Set(['german_requirement', 'seniority', 'role_type'])

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export class DrilldownValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DrilldownValidationError'
  }
}

function validateChartSegment(chart_id: string, segment_key: string): void {
  if (!SUPPORTED_CHARTS.has(chart_id)) {
    throw new DrilldownValidationError(
      `Unsupported chart_id "${chart_id}". Supported: ${[...SUPPORTED_CHARTS].join(', ')}`
    )
  }

  if (chart_id === 'german_requirement' && !GERMAN_REQ_KEYS.has(segment_key)) {
    throw new DrilldownValidationError(
      `Invalid segment_key "${segment_key}" for chart german_requirement. Valid: ${[...GERMAN_REQ_KEYS].join(', ')}`
    )
  }

  if (chart_id === 'seniority' && !SENIORITY_KEYS.has(segment_key)) {
    throw new DrilldownValidationError(
      `Invalid segment_key "${segment_key}" for chart seniority. Valid: ${[...SENIORITY_KEYS].join(', ')}`
    )
  }

  if (chart_id === 'role_type' && !ROLE_TYPE_KEYS.has(segment_key)) {
    throw new DrilldownValidationError(
      `Invalid segment_key "${segment_key}" for chart role_type. Valid: ${[...ROLE_TYPE_KEYS].join(', ')}`
    )
  }
}

// ---------------------------------------------------------------------------
// Query builder helpers
// Supabase's query builder uses complex generics; we use a loose type here
// to keep the helper functions readable without fighting the type system.
// ---------------------------------------------------------------------------

// Supabase query builder uses complex internal generics; any is intentional here
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyQuery = any

function applyChartCondition(query: AnyQuery, chart_id: string, segment_key: string): AnyQuery {
  if (chart_id === 'german_requirement') {
    return query.eq('german_requirement', segment_key)
  }
  if (chart_id === 'seniority') {
    if (segment_key === 'senior_plus') {
      return query.in('seniority', SENIOR_PLUS_VALUES)
    }
    return query.eq('seniority', segment_key)
  }
  // role_type → pm_type column
  return query.eq('pm_type', segment_key)
}

function applyUserFilters(query: AnyQuery, filters: DrilldownFilters): AnyQuery {
  if (filters.seniority?.length) {
    query = query.in('seniority', filters.seniority)
  }
  if (filters.german_requirement) {
    query = query.eq('german_requirement', filters.german_requirement)
  }
  if (filters.work_mode?.length) {
    query = query.in('work_mode', filters.work_mode)
  }
  if (filters.date_from) {
    query = query.gte('first_seen_date', filters.date_from)
  }
  if (filters.date_to) {
    query = query.lte('first_seen_date', filters.date_to)
  }
  return query
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const SELECT_FIELDS =
  'job_id, job_title_normalized, company_name, location_normalized, seniority, german_requirement, work_mode, canonical_url'

export async function queryDrilldown(
  chart_id: string,
  segment_key: string,
  filters: DrilldownFilters,
  limit: number,
  offset: number,
): Promise<DrilldownResult> {
  validateChartSegment(chart_id, segment_key)

  const supabase = getSupabaseClient()

  // Paginated results
  let dataQuery: AnyQuery = supabase
    .from('jobs')
    .select(SELECT_FIELDS)
    .eq('is_active', true)
    .order('first_seen_date', { ascending: false })
    .range(offset, offset + limit - 1)

  dataQuery = applyChartCondition(dataQuery, chart_id, segment_key)
  dataQuery = applyUserFilters(dataQuery, filters)

  // Count (same conditions, no pagination)
  let countQuery: AnyQuery = supabase
    .from('jobs')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true)

  countQuery = applyChartCondition(countQuery, chart_id, segment_key)
  countQuery = applyUserFilters(countQuery, filters)

  const [dataResult, countResult] = await Promise.all([dataQuery, countQuery])

  if (dataResult.error) throw new Error(dataResult.error.message)
  if (countResult.error) throw new Error(countResult.error.message)

  const jobs: DrilldownJob[] = (dataResult.data ?? []).map(
    (row: Record<string, unknown>) => ({
      job_id: row.job_id as string,
      title: (row.job_title_normalized as string) ?? null,
      company_name: (row.company_name as string) ?? null,
      location_normalized: (row.location_normalized as string) ?? null,
      seniority: (row.seniority as string) ?? null,
      german_requirement: (row.german_requirement as string) ?? null,
      work_mode: (row.work_mode as string) ?? null,
      canonical_url: (row.canonical_url as string) ?? null,
    })
  )

  return {
    total_jobs: countResult.count ?? 0,
    jobs,
  }
}
