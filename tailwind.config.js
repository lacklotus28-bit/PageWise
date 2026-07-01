/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        serif: ['Georgia', 'Cambria', 'Times New Roman', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Pagewise purple palette — derived from the app icon
        pw: {
          950: '#0A0718',
          900: '#110D26',
          800: '#1A1438',
          750: '#201A47',
          700: '#2B2260',
          600: '#3D3190',
          500: '#5A42C8',
          400: '#7B5CF0',
          300: '#A48BF5',
          200: '#C9BBFD',
          100: '#E8E2FD',
          50:  '#F5F2FF',
        },
        sepia: {
          50: '#fdf8f0',
          100: '#f8f0dc',
          200: '#f0deb8',
        },
      },
      boxShadow: {
        'pw-glow': '0 0 0 1.5px #5A42C8, 0 8px 32px rgba(90, 66, 200, 0.4)',
        'pw-card': '0 2px 16px rgba(10, 7, 24, 0.7)',
      },
    },
  },
  plugins: [],
}
