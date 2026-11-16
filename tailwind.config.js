/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // Licensee space (/my/*) design tokens - taghunter-home-redesign/HANDOFF.md.
      colors: {
        th: {
          accent: '#D42A35',
          'accent-soft': '#FBEAEB',
          'accent-light': '#E8888D',
          sidebar: '#0E1424',
          hero: '#111A33',
          bg: '#F4F5F8',
          border: '#E6E8EF',
          'border-strong': '#E3E6ED',
          ink: '#0F172A',
          ink2: '#3B4458',
          muted: '#5B6478',
          'nav-text': '#A3ADC2',
          'nav-label': '#8B95AB',
          mystery: '#6D4AFF',
          clash: '#C62F37',
          tracks: '#187A43',
          tagquest: '#A14A06',
        },
      },
      fontFamily: {
        'th-body': ['Inter', 'system-ui', 'sans-serif'],
        'th-display': ['"Space Grotesk"', 'Inter', 'sans-serif'],
      },
      borderRadius: {
        'th-sm': '10px',
        th: '12px',
        'th-card': '16px',
        'th-tile': '18px',
        'th-xl': '22px',
      },
    },
  },
  plugins: [],
};
