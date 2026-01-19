/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: '#09090b', // zinc-950
        surface: '#18181b',    // zinc-900
        border: '#27272a',     // zinc-800
        primary: '#e4e4e7',    // zinc-200
        secondary: '#a1a1aa',  // zinc-400
        signal: {
          good: '#34d399',     // emerald-400
          weak: '#fbbf24',     // amber-400
          none: '#52525b',     // zinc-600
        }
      }
    },
  },
  plugins: [],
}
