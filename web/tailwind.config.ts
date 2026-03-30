import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0a0a0a',
        surface: '#141414',
        'surface-elevated': '#1c1c1c',
        border: 'rgba(255,255,255,0.08)',
        'border-strong': 'rgba(255,255,255,0.14)',
        accent: '#818cf8',
        'accent-dim': '#4f46e5',
        positive: '#4ade80',
        warning: '#fb923c',
        muted: '#737373',
        subtle: '#404040',
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
