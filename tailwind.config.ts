import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-plus-jakarta)', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        amber: {
          50: '#FFFDF5',
          100: '#FEF3C7',
          200: '#FDE68A',
          300: '#FCD34D',
          400: '#FBBF24',
          500: '#F59E0B',
          600: '#D97706',
          700: '#B45309',
          800: '#92400E',
          900: '#78350F',
        },
        navy: {
          50: '#F0F4FA',
          100: '#DCE6F5',
          200: '#BDCEEB',
          300: '#8FA8D4',
          400: '#5B7AB0',
          500: '#3A568C',
          600: '#2A4170',
          700: '#1C3364',
          800: '#132347',
          900: '#0E1B38',
          950: '#070E1E',
        },
        control: {
          canvas: '#F4F6F9',
          card: '#FFFFFF',
          border: '#E2E8F0',
          hover: '#F8FAFC',
          darkCanvas: '#050A15',
          darkCard: '#0A1324',
          darkBorder: '#16233B',
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic':
          'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
      },
      boxShadow: {
        'amber-glow': '0 4px 14px 0 rgba(217, 119, 6, 0.25)',
      },
    },
  },
  plugins: [],
}
export default config
