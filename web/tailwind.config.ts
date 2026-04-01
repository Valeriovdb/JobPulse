import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0a0a0a',
        surface: '#141414',
        'surface-elevated': '#1c1c1c',
        border: 'rgba(255,255,255,0.10)',
        'border-strong': 'rgba(255,255,255,0.14)',
        accent: '#818cf8',
        'accent-dim': '#4f46e5',
        positive: '#4ade80',
        warning: '#fb923c',
        muted: '#b0b0b0',
        subtle: '#5c5c5c',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        '2xs': ['0.65rem', '1rem'],
      },
    },
  },
  plugins: [],
}

export default config
