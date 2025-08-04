const primeui = require('tailwindcss-primeui')

module.exports = {
  content: [
    './index.html',
    './components/**/*.vue',
    './App.vue',
    './main.ts'
  ],
  theme: {
    extend: {}
  },
  plugins: [
    primeui.handler,
    require('autoprefixer')
  ]
}
