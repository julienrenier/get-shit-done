/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        gsd: {
          bg: '#0b0d10',
          surface: '#1a1f2e',
          'surface-variant': '#2d3748',
          fg: '#e8e8e8',
          'fg-muted': '#a0a0a0',
          accent: '#4a9eff',
          'accent-dark': '#2e6cb8',
          success: '#4ade80',
          warning: '#fbbf24',
          destructive: '#ef4444',
          info: '#8b5cf6',
        },
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Menlo"', 'monospace'],
      },
      fontSize: {
        xs: ['12px', { lineHeight: '1.5' }],
        sm: ['14px', { lineHeight: '1.5' }],
        lg: ['18px', { lineHeight: '1.2' }],
        xl: ['24px', { lineHeight: '1.2' }],
      },
    },
  },
  plugins: [],
};
