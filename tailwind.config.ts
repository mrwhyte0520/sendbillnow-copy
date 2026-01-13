
import type { Config } from 'tailwindcss'

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  safelist: [
    'bg-blue-100', 'text-blue-600',
    'bg-red-100', 'text-red-600',
    'bg-green-100', 'text-green-600',
    'bg-purple-100', 'text-purple-600',
    'bg-indigo-100', 'text-indigo-600',
    'bg-cyan-100', 'text-cyan-600',
    'bg-orange-100', 'text-orange-600',
    'bg-slate-100', 'text-slate-600',
  ],
  theme: {
    extend: {
      colors: {
        green: {
          50: '#008000',
          100: '#008000',
          200: '#008000',
          300: '#008000',
          400: '#008000',
          500: '#008000',
          600: '#008000',
          700: '#008000',
          800: '#008000',
          900: '#008000',
        },
        emerald: {
          50: '#008000',
          100: '#008000',
          200: '#008000',
          300: '#008000',
          400: '#008000',
          500: '#008000',
          600: '#008000',
          700: '#008000',
          800: '#008000',
          900: '#008000',
        },
        lime: {
          50: '#008000',
          100: '#008000',
          200: '#008000',
          300: '#008000',
          400: '#008000',
          500: '#008000',
          600: '#008000',
          700: '#008000',
          800: '#008000',
          900: '#008000',
        },
        navy: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
        }
      },
      fontFamily: {
        'pacifico': ['Pacifico', 'serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'bounce-gentle': 'bounceGentle 2s infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        bounceGentle: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-5px)' },
        },
      },
      backdropBlur: {
        xs: '2px',
      }
    },
  },
  plugins: [
    function({ addUtilities }: { addUtilities: any }) {
      const newUtilities = {
        '.scrollbar-thin': {
          scrollbarWidth: 'thin',
        },
        '.scrollbar-thumb-gray-300': {
          scrollbarColor: '#d1d5db transparent',
        },
        '.scrollbar-thumb-stone-300': {
          scrollbarColor: '#d6d3d1 transparent',
        },
        '.scrollbar-track-transparent': {
          scrollbarColor: '#d6d3d1 transparent',
        },
        '.scrollbar-thin::-webkit-scrollbar': {
          width: '6px',
        },
        '.scrollbar-thin::-webkit-scrollbar-track': {
          background: 'transparent',
        },
        '.scrollbar-thin::-webkit-scrollbar-thumb': {
          background: '#d1d5db',
          borderRadius: '3px',
        },
        '.scrollbar-thin::-webkit-scrollbar-thumb:hover': {
          background: '#9ca3af',
        },
      }
      addUtilities(newUtilities)
    }
  ],
} satisfies Config
