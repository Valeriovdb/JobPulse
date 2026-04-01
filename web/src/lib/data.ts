import fs from 'fs'
import path from 'path'
import type { Metadata, Overview, Distributions, Timeseries, ExperienceData, ChartInsights } from '@/types/data'

// data/frontend/ sits one level above the web/ directory
const DATA_DIR = path.join(process.cwd(), '..', 'data', 'frontend')

function readJSON<T>(filename: string, fallback: T): T {
  try {
    const raw = fs.readFileSync(path.join(DATA_DIR, filename), 'utf-8')
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function getMetadata(): Metadata {
  return readJSON<Metadata>('metadata.json', {
    last_updated: '',
    generated_at: '',
    scope: 'Berlin + remote Germany',
    role_type: 'Product Management',
  })
}

export function getOverview(): Overview {
  return readJSON<Overview>('overview.json', {
    last_updated: '',
    n_active: 0,
    n_new_week: 0,
    senior_pct: 0,
    median_age_days: 0,
    accessible_pct: 0,
    entry_pct: 0,
    language: { en_none: 0, en_plus: 0, en_must: 0, de: 0 },
    location: { berlin: 0, remote_germany: 0, unclear: 0 },
  })
}

export function getDistributions(): Distributions {
  return readJSON<Distributions>('distributions.json', {
    seniority: [],
    work_mode: [],
    language: [],
    german_requirement: [],
    pm_type: [],
    industry: [],
    ai: { n_enriched: 0, n_ai_focus: 0, n_ai_skills: 0, ai_focus_pct: 0, ai_skills_pct: 0 },
    source: [],
    companies: { top20: [], n_companies: 0, top10_share: 0, top10_pct: 0, multi_hiring: 0 },
  })
}

export function getTimeseries(): Timeseries {
  return readJSON<Timeseries>('timeseries.json', {
    new_per_day: [],
    active_per_day: [],
    market_activity: [],
  })
}

export function getExperience(): ExperienceData {
  return readJSON<ExperienceData>('experience.json', {
    tags: [],
    jobs_by_tag: {},
    n_jobs_with_tags: 0,
    n_active: 0,
  })
}

export function getChartInsights(): ChartInsights {
  return readJSON<ChartInsights>('chart_insights.json', {
    generated_at: '',
    data_version: '',
    charts: {},
  })
}

export function formatDate(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso + 'T00:00:00Z')
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}
