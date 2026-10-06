/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        heading: ['Nunito', 'sans-serif'],
        body: ['"DM Sans"', 'sans-serif'],
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
        cream: '#FFFFFF',
        ink: '#1F1B13',
      },
      boxShadow: {
        // Cards are DARKER than the page, so depth comes from a warm drop
        // shadow below-right + white highlight above-left + the tint contrast.
        neo: '8px 8px 20px rgba(167,138,70,0.28), -6px -6px 14px #FFFFFF',
        'neo-sm': '5px 5px 12px rgba(167,138,70,0.3), -4px -4px 10px #FFFFFF',
        'neo-xs': '3px 3px 8px rgba(167,138,70,0.3), -3px -3px 7px #FFFFFF',
        'neo-inset': 'inset 5px 5px 10px rgba(146,117,48,0.22), inset -4px -4px 9px rgba(255,255,255,0.95)',
        'neo-inset-sm': 'inset 4px 4px 8px rgba(146,117,48,0.2), inset -3px -3px 7px rgba(255,255,255,0.9)',
        lift: '12px 12px 28px rgba(150,120,55,0.35), -8px -8px 18px #FFFFFF',
      },
    },
  },
  plugins: [],
};
