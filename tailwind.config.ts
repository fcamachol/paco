import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'bg-primary': '#0d0d0d',
        'bg-secondary': '#141414',
        'bg-tertiary': '#1a1a1a',
        'bg-elevated': '#1f1f1f',
        'accent': '#e07a5f',
        'accent-dim': '#c4684f',
        'accent-muted': 'rgba(224, 122, 95, 0.15)',
        'text-primary': '#e5e5e5',
        'text-secondary': '#888888',
        'text-muted': '#555555',
        'success': '#4ade80',
        'warning': '#fbbf24',
        'error': '#f87171',
        'border': '#2a2a2a',
        'border-hover': '#3a3a3a',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'SF Mono', 'Fira Code', 'monospace'],
        sans: ['Inter', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
