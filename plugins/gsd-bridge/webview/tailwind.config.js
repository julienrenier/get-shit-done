/** @type {import('tailwindcss').Config} */
//
// Tailwind config — dual-palette bridge.
//
// 1. Stock shadcn design tokens (background, foreground, card, primary, etc.)
//    are exposed as Tailwind color utilities backed by CSS variables defined in
//    `src/theme.css`. These power `@json-render/shadcn`'s built-in components
//    (Card, RadioGroup, Checkbox, Button, Separator, Label, ...) so they render
//    with the neutral/slate shadcn default look required by the POC.
//
// 2. The legacy `gsd.*` palette (dark terminal look) is preserved so the 6
//    custom GSD components shipped in `src/components/` keep rendering
//    correctly when a host spec references them. They are NOT used by the POC
//    (Plan 04-05 v2 refactor — shadcn-only POC per user feedback 2026-04-24).
//
// Reference: https://ui.shadcn.com/docs/theming (CSS variables strategy).
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // === Stock shadcn tokens (POC + host specs) ===
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },

        // === Legacy GSD brand palette (custom components only) ===
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
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        // Default stack follows shadcn (system UI). `mono` kept for legacy
        // GSD components + any spec that opts into terminal aesthetics.
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          '"Helvetica Neue"',
          'Arial',
          'sans-serif',
        ],
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
