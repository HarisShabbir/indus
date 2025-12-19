/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Custom colors from your existing CSS variables
        'app-bg': 'var(--app-bg)',
        'surface-1': 'var(--surface-1)',
        'surface-2': 'var(--surface-2)',
        'text-primary': 'var(--text-primary)',
        'text-muted': 'var(--text-muted)',
        'accent': 'var(--accent)',
        'accent-warm': 'var(--accent-warm)',
        'accent-cool': 'var(--accent-cool)',
        'border-subtle': 'var(--border-subtle)',
      },
      fontFamily: {
        'sans': ['Inter', 'Segoe UI', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        'soft': 'var(--shadow-soft)',
        'strong': 'var(--shadow-strong)',
      },
      backdropBlur: {
        'xs': '2px',
      }
    },
  },
  plugins: [],
}