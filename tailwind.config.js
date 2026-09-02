/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx}', './components/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        plane: 'var(--plane)', surface: 'var(--surface)', surface2: 'var(--surface-2)',
        ink: 'var(--ink)', ink2: 'var(--ink-2)', muted: 'var(--muted)',
        hair: 'var(--border)', grid: 'var(--grid)',
        inflow: 'var(--s-in)', cutflow: 'var(--s-cut)', balance: 'var(--s-bal)',
        good: '#0ca30c', warn: '#fab219', serious: '#ec835a', crit: '#d03b3b'
      },
      fontFamily: {
        sans: ['Archivo', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'SFMono-Regular', 'monospace']
      }
    }
  },
  plugins: []
};
