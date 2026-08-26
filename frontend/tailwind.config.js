/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class', // support class-based dark mode
  theme: {
    extend: {
      colors: {
        cyber: {
          bg: '#030712', // deep slate/black
          card: '#0b0f19', // card background
          border: '#1f2937', // dark borders
          blue: '#38bdf8', // neon cyan/blue
          purple: '#818cf8', // accent purple
          green: '#10b981', // safe real
          yellow: '#f59e0b', // warning medium
          red: '#ef4444', // threat high
          gray: '#94a3b8' // text subtext
        }
      },
      fontFamily: {
        sans: ['Outfit', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'cyber-neon': '0 0 15px rgba(56, 189, 248, 0.15)',
        'cyber-red': '0 0 15px rgba(239, 68, 68, 0.25)',
      }
    },
  },
  plugins: [],
}
