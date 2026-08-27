/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class', // supports class-based styling
  theme: {
    extend: {
      colors: {
        cyber: {
          bg: '#f8fafc', // bright slate background
          card: '#ffffff', // pure white card
          border: '#e2e8f0', // soft border gray
          blue: '#0284c7', // rich ocean blue
          purple: '#6366f1', // deep indigo/purple accent
          green: '#10b981', // emerald green (safe)
          yellow: '#f59e0b', // warning amber
          red: '#ef4444', // threat ruby red
          gray: '#64748b' // dark subtext gray
        }
      },
      fontFamily: {
        sans: ['Outfit', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'cyber-neon': '0 4px 20px rgba(2, 132, 199, 0.1)',
        'cyber-red': '0 4px 20px rgba(239, 68, 68, 0.15)',
      }
    },
  },
  plugins: [],
}
