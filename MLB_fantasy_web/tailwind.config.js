/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        pr: {
          elite:   '#1a7a1a',
          good:    '#5cb85c',
          average: '#f0ad4e',
          below:   '#e87722',
          poor:    '#d9534f',
        },
      },
    },
  },
  plugins: [],
}
