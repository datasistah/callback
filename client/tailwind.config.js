/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Dark-mode-first semantic palette. `ink` is the primary (light) text
        // color so existing `text-ink` usages read correctly on a dark canvas.
        bg: '#0b0f17', // page canvas
        surface: '#141b2b', // cards, inputs, panels
        'surface-hover': '#1c2536', // hover / raised surface
        border: '#26324a', // hairlines
        ink: '#e8ecf3', // primary text
        muted: '#94a3b8', // secondary text
        accent: {
          DEFAULT: '#6366f1', // indigo-500, brightened for dark
          hover: '#818cf8', // indigo-400
        },
      },
    },
  },
  plugins: [],
}
