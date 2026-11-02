/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        night: {
          950: '#07090c',
          900: '#0c0f14',
          800: '#141820',
          700: '#1c222c',
          600: '#2a313d',
          500: '#3a4250',
          400: '#6b7484',
          300: '#9aa3b2',
        },
        snow: '#eef2f8',
        gold: { DEFAULT: '#f5c451', dark: '#c99a2e' },
        grinch: { DEFAULT: '#ef4444', light: '#f87171', dark: '#b91c1c', deep: '#3b0d0d' },
        elf: { DEFAULT: '#22c55e', light: '#4ade80', dark: '#15803d', deep: '#0b2e19' },
      },
      fontFamily: {
        display: ['"Archivo Black"', 'Impact', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        festive: ['"Mountains of Christmas"', 'Georgia', 'serif'],
      },
      boxShadow: {
        'glow-red': '0 0 24px -4px rgba(239, 68, 68, 0.55)',
        'glow-green': '0 0 24px -4px rgba(34, 197, 94, 0.55)',
        'glow-gold': '0 0 24px -6px rgba(245, 196, 81, 0.6)',
      },
      keyframes: {
        snowfall: {
          '0%': { transform: 'translate3d(0, -10vh, 0)' },
          '100%': { transform: 'translate3d(var(--drift, 20px), 110vh, 0)' },
        },
        twinkle: {
          '0%, 100%': { opacity: '0.35' },
          '50%': { opacity: '1' },
        },
      },
      animation: {
        snowfall: 'snowfall linear infinite',
        twinkle: 'twinkle 2.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
