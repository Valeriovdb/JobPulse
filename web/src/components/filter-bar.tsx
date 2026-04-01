'use client'

export interface FilterState {
  seniority: 'all' | 'junior' | 'mid' | 'senior' | 'lead'
  language: 'all' | 'en_only' | 'en_plus' | 'de_required'
  location: 'all' | 'berlin' | 'remote'
  time: 'all' | '7d' | '30d'
}

export const DEFAULT_FILTERS: FilterState = {
  seniority: 'all',
  language: 'all',
  location: 'all',
  time: 'all',
}

export function hasActiveFilter(f: FilterState): boolean {
  return f.seniority !== 'all' || f.language !== 'all' || f.location !== 'all' || f.time !== 'all'
}

interface FilterBarProps {
  filters: FilterState
  onChange: (next: FilterState) => void
}

const selectBase =
  'appearance-none bg-surface border rounded-full pl-3.5 pr-7 py-1.5 text-xs cursor-pointer focus:outline-none transition-colors shrink-0'
const selectDefault = 'border-border text-muted hover:border-border-strong hover:text-white'
const selectActive = 'border-accent/60 text-white bg-surface-elevated'

function FilterSelect<K extends keyof FilterState>({
  id,
  value,
  options,
  onChange,
}: {
  id: K
  value: FilterState[K]
  options: { value: FilterState[K]; label: string }[]
  onChange: (v: FilterState[K]) => void
}) {
  const isActive = value !== 'all'
  return (
    <div className="relative shrink-0">
      <select
        value={value as string}
        onChange={(e) => onChange(e.target.value as FilterState[K])}
        className={[selectBase, isActive ? selectActive : selectDefault].join(' ')}
      >
        {options.map((o) => (
          <option key={o.value as string} value={o.value as string}>
            {o.label}
          </option>
        ))}
      </select>
      {/* Chevron */}
      <span
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-subtle leading-none"
        style={{ fontSize: '9px' }}
      >
        ▾
      </span>
    </div>
  )
}

export function FilterBar({ filters, onChange }: FilterBarProps) {
  const isActive = hasActiveFilter(filters)

  return (
    <div className="relative mb-8">
      {/* Scrollable row */}
      <div className="flex items-center gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <FilterSelect
          id="seniority"
          value={filters.seniority}
          onChange={(v) => onChange({ ...filters, seniority: v })}
          options={[
            { value: 'all', label: 'All levels' },
            { value: 'junior', label: 'Junior' },
            { value: 'mid', label: 'Mid' },
            { value: 'senior', label: 'Senior' },
            { value: 'lead', label: 'Lead+' },
          ]}
        />
        <FilterSelect
          id="language"
          value={filters.language}
          onChange={(v) => onChange({ ...filters, language: v })}
          options={[
            { value: 'all', label: 'All languages' },
            { value: 'en_only', label: 'English only' },
            { value: 'en_plus', label: 'German a plus' },
            { value: 'de_required', label: 'German required' },
          ]}
        />
        <FilterSelect
          id="location"
          value={filters.location}
          onChange={(v) => onChange({ ...filters, location: v })}
          options={[
            { value: 'all', label: 'All locations' },
            { value: 'berlin', label: 'Berlin' },
            { value: 'remote', label: 'Remote' },
          ]}
        />
        <FilterSelect
          id="time"
          value={filters.time}
          onChange={(v) => onChange({ ...filters, time: v })}
          options={[
            { value: 'all', label: 'All time' },
            { value: '7d', label: 'Last 7 days' },
            { value: '30d', label: 'Last 30 days' },
          ]}
        />

        {isActive && (
          <button
            onClick={() => onChange(DEFAULT_FILTERS)}
            className="shrink-0 text-2xs text-subtle hover:text-white transition-colors px-2 py-1.5 rounded-full hover:bg-surface whitespace-nowrap"
          >
            Reset
          </button>
        )}
      </div>

      {/* Right-edge fade for mobile scroll hint */}
      <div
        className="absolute right-0 top-0 h-full w-12 pointer-events-none"
        style={{ background: 'linear-gradient(to right, transparent, #0a0a0a)' }}
      />
    </div>
  )
}
