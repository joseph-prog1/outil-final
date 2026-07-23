/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Identité "fund manager": vert forêt profond, crème papier, encre
        forest: {
          DEFAULT: '#0C2A1B',
          deep: '#081E13',
          soft: '#1A3D2A',
        },
        cream: '#F2EFE7',
        paper: '#FBFAF5',
        line: '#DCD6C8',
        ink: '#17150F',
        muted: '#6F6A5C',
      },
      fontFamily: {
        serif: ['"Instrument Serif"', 'Georgia', 'serif'],
        sans: ['"Helvetica Neue"', 'Helvetica', 'Arial', 'sans-serif'],
      },
      letterSpacing: {
        caps: '0.14em',
      },
    },
  },
  plugins: [],
}
