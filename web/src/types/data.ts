export interface Metadata {
  last_updated: string
  generated_at: string
  scope: string
  role_type: string
}

export interface Overview {
  last_updated: string
  n_active: number
  n_new_week: number
  senior_pct: number
  median_age_days: number
  accessible_pct: number
  entry_pct: number
  language: {
    en_none: number
    en_plus: number
    en_must: number
    de: number
  }
  location: {
    berlin: number
    remote_germany: number
    unclear: number
  }
}

export interface DistributionItem {
  label: string
  count: number
}

export interface Distributions {
  seniority: DistributionItem[]
  work_mode: DistributionItem[]
  language: DistributionItem[]
  german_requirement: DistributionItem[]
  pm_type: DistributionItem[]
  industry: DistributionItem[]
  industry_normalized?: DistributionItem[]
  visa_sponsorship?: DistributionItem[]
  relocation_support?: DistributionItem[]
  domain_req_strength?: DistributionItem[]
  domain_req_breakdown?: Array<{ domain: string; hard: number; soft: number; total: number }>
  seniority_experience_bubble?: Array<{ seniority: string; years_min: number; count: number }>
  industry_experience_bubble?: Array<{ industry: string; years_min: number; count: number }>
  years_experience?: {
    median: number
    buckets: DistributionItem[]
    n_extractable: number
  }
  ai: {
    n_enriched: number
    n_ai_focus: number
    n_ai_skills: number
    ai_focus_pct: number
    ai_skills_pct: number
  }
  source: DistributionItem[]
  companies: {
    top20: DistributionItem[]
    n_companies: number
    top10_share: number
    top10_pct: number
    multi_hiring: number
  }
}

// --- Job (job-level records for drill-down) ---

export interface Job {
  id: string
  title?: string
  company?: string
  url?: string
  location: 'berlin' | 'remote_germany' | 'unclear'
  work_mode: string
  seniority: string
  language: 'en' | 'de' | 'unknown'
  german_req: 'not_mentioned' | 'plus' | 'must' | 'unclassified'
  pm_type: string | null
  ai_focus: boolean
  ai_skills: boolean
  first_seen_date: string | null
  industry: string | null
}

// --- Experience tags ---

export interface ExperienceTag {
  tag: string
  family: 'domain' | 'functional' | 'operating_context'
  count: number
}

export interface ExperienceJob {
  job_id: string
  company: string
  title: string
  seniority: string
  url: string
  level: 'required' | 'preferred' | 'not_clear'
  evidence: string
}

export interface ExperienceData {
  tags: ExperienceTag[]
  jobs_by_tag: Record<string, ExperienceJob[]>
  n_jobs_with_tags: number
  n_active: number
}

// --- Timeseries ---

export interface MarketActivityRow {
  date: string
  seniority: string
  location: string
  language: string
  german_req: string
  active_jobs: number
  jobs_added: number
  jobs_removed: number
}

export interface TimeseriesPoint {
  date: string
  count: number
}

export interface Timeseries {
  new_per_day: TimeseriesPoint[]
  active_per_day: TimeseriesPoint[]
  market_activity?: MarketActivityRow[]
  lifespan?: {
    median_days: number
    mean_days: number
    pct_gone_week: number
    n_inactive: number
  }
  seniority_mix?: {
    dates: string[]
    series: Record<string, number[]>
  }
  german_req_mix?: {
    dates: string[]
    series: Record<string, number[]>
  }
}

// --- Chart insights ---

export interface ChartInsight {
  title: string
  subtitle: string
  source: 'llm' | 'fallback'
  generated_at: string
  model: string | null
}

export interface ChartInsights {
  generated_at: string
  data_version: string
  charts: Record<string, ChartInsight>
}
