import snowballPreset from '@snowball/ui/tailwind-preset';
/** @type {import('tailwindcss').Config} */
export default {
  presets: [snowballPreset],
  content: ['./index.html', './src/**/*.{ts,tsx}', './node_modules/@snowball/ui/dist/**/*.js'],
  theme: {
    extend: {
      fontFamily: {
        heading: ['Inter', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
      },
      colors: {
        honey: {
          50: '#FBF5EA', 100: '#F6E9D0', 200: '#EDD3A1', 300: '#E3BC71',
          400: '#D6A747', 500: '#C8922A', 600: '#A87722', 700: '#855D1B',
          800: '#634514', 900: '#422E0D',
        },
        sky: {
          50: '#EFF8FB', 100: '#D9EEF5', 200: '#B3DDEB', 300: '#8DCCE0',
          400: '#67BDD8', 500: '#4BAED0', 600: '#3690B0', 700: '#2A7089',
          800: '#1E5062', 900: '#12303B',
        },
        // Layer system (contrast-based): page = warm white, cards = cream.
        cream: 'var(--bg)',
        ink: 'var(--txt)',
      },
      boxShadow: {
        neo: '8px 8px 20px var(--shadow-dark), -6px -6px 16px var(--shadow-light), inset 0 1px 1px var(--sheen-line)',
        'neo-sm': '4px 4px 10px var(--shadow-dark-soft), -2px -2px 6px var(--shadow-light-soft)',
        'neo-xs': '2px 2px 5px var(--shadow-dark-soft), -1px -1px 3px var(--shadow-light)',
        'neo-inset': 'inset 3px 3px 6px var(--shadow-inset-dark), inset -2px -2px 5px var(--shadow-inset-light)',
        'neo-inset-sm': 'inset 2px 2px 5px var(--shadow-inset-dark), inset -1px -1px 3px var(--shadow-inset-light)',
        lift: '8px 10px 24px var(--shadow-dark)',
      },
    },
  },
  plugins: [],
};
