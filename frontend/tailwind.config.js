module.exports = {
  purge: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html",
  ],
  darkMode: false,
  theme: {
    extend: {
      colors: {
        ink: '#12161C',
        'ink-muted': '#5B6470',
        paper: '#F5F6F8',
        surface: '#FFFFFF',
        line: '#E2E5EA',
        circuit: {
          DEFAULT: '#2E4CDB',
          dark: '#2440B8',
          soft: '#EEF1FE',
        },
        signal: {
          green: '#16A34A',
          'green-soft': '#E9F8EF',
          'green-line': '#BFE8CE',
          amber: '#D97706',
          'amber-soft': '#FDF3E4',
          'amber-line': '#F3D9AE',
          slate: '#6B7280',
          'slate-soft': '#EEF0F2',
          'slate-line': '#D7DBE0',
          red: '#DC2626',
          'red-soft': '#FDECEC',
          'red-line': '#F5C6C6',
        },
      },
      fontFamily: {
        display: ['Sora', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px 0 rgba(18,22,28,0.05), 0 1px 3px 0 rgba(18,22,28,0.04)',
        'card-hover': '0 4px 10px -2px rgba(18,22,28,0.10), 0 2px 4px -2px rgba(18,22,28,0.06)',
        'led-green': '0 0 0 4px rgba(22,163,74,0.16)',
        'led-amber': '0 0 0 4px rgba(217,119,6,0.16)',
        'led-slate': '0 0 0 4px rgba(107,114,128,0.14)',
      },
    },
  },
  variants: {
    extend: {},
  },
  plugins: [],
}
