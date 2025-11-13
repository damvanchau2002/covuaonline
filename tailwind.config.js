/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/**/*.{js,ts,jsx,tsx}',
    './src/app/**/*.{js,ts,jsx,tsx}',
    './src/components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        boardDark: '#2f3640',
        boardLight: '#dcdde1',
        accent: '#00a8ff',
      },
      boxShadow: {
        glow: '0 0 25px rgba(0,168,255,0.35)'
      }
    },
  },
  plugins: [],
};