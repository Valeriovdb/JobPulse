'use client'

import { useState } from 'react'
import type { ExperienceTag, ExperienceJob } from '@/types/data'
import { ExperiencePanel } from './experience-panel'

// --- Label mappings ---
const TAG_LABELS: Record<string, string> = {
  // Domain
  payments: 'Payments',
  banking_financial_services: 'Banking / Financial Services',
  fintech: 'Fintech',
  ecommerce_marketplace: 'E-commerce / Marketplace',
  saas_b2b_software: 'SaaS / B2B Software',
  mobility_automotive: 'Mobility / Automotive',
  logistics_supply_chain: 'Logistics / Supply Chain',
  ai_ml_data_products: 'AI / ML / Data Products',
  consumer_digital_products: 'Consumer Digital Products',
  enterprise_internal_tools: 'Enterprise Internal Tools',
  cybersecurity: 'Cybersecurity',
  healthtech: 'HealthTech',
  // Functional
  growth_acquisition: 'Growth / Acquisition',
  activation_onboarding: 'Activation / Onboarding',
  retention_engagement: 'Retention / Engagement',
  monetization_pricing: 'Monetization / Pricing',
  platform_internal_tooling: 'Platform / Internal Tooling',
  analytics_experimentation: 'Analytics / Experimentation',
  search_discovery: 'Search / Discovery',
  crm_lifecycle: 'CRM / Lifecycle',
  checkout_payments: 'Checkout / Payments',
  risk_fraud: 'Risk / Fraud',
  identity_kyc: 'Identity / KYC',
  integrations_apis: 'Integrations / APIs',
  marketplace_dynamics: 'Marketplace Dynamics',
  // Operating context
  startup_scaleup: 'Startup / Scale-up',
  enterprise: 'Enterprise',
  regulated_environment: 'Regulated Environment',
  international_multi_market: 'International / Multi-market',
  b2b: 'B2B',
  b2c: 'B2C',
  b2b2c: 'B2B2C',
  two_sided_marketplace: 'Two-sided Marketplace',
  subscription_business: 'Subscription Business',
  hardware_software: 'Hardware + Software',
}

const FAMILY_LABELS: Record<string, string> = {
  domain: 'Domain experience',
  functional: 'Functional experience',
  operating_context: 'Operating context',
}

const FAMILY_ORDER = ['domain', 'functional', 'operating_context'] as const

const FAMILY_COLORS: Record<string, string> = {
  domain: '#818cf8',
  functional: '#2dd4bf',
  operating_context: '#fb923c',
}

interface Props {
  tags: ExperienceTag[]
  jobsByTag: Record<string, ExperienceJob[]>
  nJobsWithTags: number
  nActive: number
}

export function ExperienceChart({ tags, jobsByTag, nJobsWithTags, nActive }: Props) {
  const [selectedTag, setSelectedTag] = useState<string | null>(null)

  if (!tags.length) return null

  // Group tags by family, sorted descending by count within each group
  const grouped = FAMILY_ORDER.map((family) => {
    const familyTags = tags
      .filter((t) => t.family === family)
      .sort((a, b) => b.count - a.count)
    return { family, tags: familyTags }
  }).filter((g) => g.tags.length > 0)

  const globalMax = Math.max(...tags.map((t) => t.count))

  return (
    <>
      <div className="space-y-8">
        {grouped.map(({ family, tags: familyTags }) => (
          <div key={family}>
            {/* Family heading */}
            <p className="text-xs text-muted font-medium mb-3">
              {FAMILY_LABELS[family] ?? family}
            </p>

            {/* Bars */}
            <div className="space-y-2">
              {familyTags.map((tag) => {
                const barWidth = globalMax > 0 ? (tag.count / globalMax) * 100 : 0
                const label = TAG_LABELS[tag.tag] ?? tag.tag
                const color = FAMILY_COLORS[family] ?? '#818cf8'

                return (
                  <button
                    key={tag.tag}
                    onClick={() => setSelectedTag(tag.tag)}
                    className="w-full flex items-center gap-3 group text-left hover:bg-surface-elevated/50 rounded-lg px-1 py-0.5 -mx-1 transition-colors"
                  >
                    <span className="text-sm text-muted w-48 shrink-0 truncate group-hover:text-white transition-colors">
                      {label}
                    </span>
                    <div className="flex-1 h-1.5 bg-surface-elevated rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${barWidth}%`,
                          backgroundColor: color,
                        }}
                      />
                    </div>
                    <span className="text-xs text-right shrink-0 tabular-nums w-8">
                      <span className="text-white font-medium">{tag.count}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-5 gap-y-2 mt-6">
        {FAMILY_ORDER.filter((f) => grouped.some((g) => g.family === f)).map((family) => (
          <div key={family} className="flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: FAMILY_COLORS[family] }}
            />
            <span className="text-xs text-muted">{FAMILY_LABELS[family]}</span>
          </div>
        ))}
      </div>

      {/* Side panel */}
      {selectedTag && (
        <ExperiencePanel
          tag={selectedTag}
          tagLabel={TAG_LABELS[selectedTag] ?? selectedTag}
          jobs={jobsByTag[selectedTag] ?? []}
          onClose={() => setSelectedTag(null)}
        />
      )}
    </>
  )
}
