"""
Controlled vocabulary for LLM-extracted enrichment fields.

These lists are the single source of truth for allowed values.
They are imported by llm.py for validation and referenced in the LLM prompt.
Adding a new value here is the only change needed to expand a taxonomy.
"""

# ---------------------------------------------------------------------------
# Employer industry (industry_normalized)
# The employer's primary industry vertical — NOT the candidate's background.
# ---------------------------------------------------------------------------
INDUSTRY_NORMALIZED_VALUES: list[str] = [
    "fintech_payments",       # fintech, neobanking, payments, lending, insurance tech
    "ecommerce_marketplace",  # online retail, marketplaces, delivery, recommerce
    "saas_b2b_software",      # horizontal B2B SaaS not covered by a vertical below
    "healthtech_biotech",     # health, medical, pharma, biotech, wellness
    "mobility_automotive",    # automotive tech, ride-hailing, fleet, EV
    "logistics_supply_chain", # freight, last-mile, supply chain
    "media_entertainment",    # streaming, gaming, content, social
    "cybersecurity",          # security products, identity, compliance tech
    "hrtech_future_of_work",  # HR software, recruiting tech, workforce management
    "proptech_construction",  # real estate tech, construction software
    "consumer_apps",          # consumer digital products not covered by other verticals
    "other",                  # does not fit any of the above
]

# ---------------------------------------------------------------------------
# Candidate domain requirement strength
# How strongly the posting requires specific domain background from the candidate.
# ---------------------------------------------------------------------------
DOMAIN_REQ_STRENGTH_VALUES: list[str] = [
    "hard",    # explicitly required / must-have / mandatory
    "soft",    # preferred / nice-to-have / ideal
    "none",    # no domain background requirement mentioned
    "unclear", # hints exist but not enough confidence to classify
]

# ---------------------------------------------------------------------------
# Candidate domain background requested (candidate_domain_requirement_normalized)
# Reuses the experience_requirements domain family taxonomy for consistency,
# plus a "none" sentinel when no domain background is required.
# ---------------------------------------------------------------------------
CANDIDATE_DOMAIN_VALUES: list[str] = [
    "payments",
    "banking_financial_services",
    "fintech",
    "ecommerce_marketplace",
    "saas_b2b_software",
    "mobility_automotive",
    "logistics_supply_chain",
    "ai_ml_data_products",
    "consumer_digital_products",
    "enterprise_internal_tools",
    "cybersecurity",
    "healthtech",
    "none",  # use only when candidate_domain_requirement_strength is "none"
]

# ---------------------------------------------------------------------------
# Tristate status fields (visa sponsorship, relocation support)
# Conservative: yes/no only when explicitly stated; unclear otherwise.
# ---------------------------------------------------------------------------
TRISTATE_VALUES: list[str] = [
    "yes",
    "no",
    "unclear",
]
