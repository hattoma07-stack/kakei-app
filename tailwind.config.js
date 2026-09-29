/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef7f2', 100: '#d6ecdf', 500: '#2fa26a', 600: '#268a58', 700: '#1f7048',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"Hiragino Kaku Gothic ProN"', '"Noto Sans JP"', 'Meiryo', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
