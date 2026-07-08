/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'grazzia': {
          DEFAULT: '#3b82f6', // blue-500
          dark: '#1e3a8a',    // blue-900
          accent: '#10b981',  // emerald-500
        }
      }
    },
  },
  plugins: [],
}
