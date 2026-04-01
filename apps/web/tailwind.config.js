/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#09090b',
        foreground: '#f8fafc',
        card: '#18181b',
        'card-foreground': '#f8fafc',
        primary: '#3b82f6',
        'primary-foreground': '#ffffff',
        accent: '#27272a',
        'accent-foreground': '#f8fafc',
        muted: '#27272a',
        'muted-foreground': '#a1a1aa',
        border: '#27272a',
        destructive: '#ef4444',
      },
      borderRadius: {
        lg: '0.75rem',
        md: '0.5rem',
        sm: '0.25rem',
      }
    },
  },
  plugins: [],
}
