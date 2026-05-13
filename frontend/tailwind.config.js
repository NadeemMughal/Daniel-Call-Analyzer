/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input:  'hsl(var(--input))',
        ring:   'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground:  'hsl(var(--foreground))',
        brand: {
          DEFAULT: '#1a1a2e',
          50:  '#f0f0f8',
          100: '#d4d4ed',
          600: '#1a1a2e',
          700: '#141427',
          800: '#0e0e1f',
        },
      },
      borderRadius: {
        lg: '0.625rem',
        md: '0.5rem',
        sm: '0.375rem',
      },
    },
  },
  plugins: [],
}
