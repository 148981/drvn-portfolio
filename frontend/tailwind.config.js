/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Loewe Color Palette
        loewe: {
          dark: '#3A342F',      // Darker Taupe (Main BG)
          taupe: '#4A3F37',     // Dark Taupe
          medium: '#8A7A6D',    // Medium Taupe (Card BG)
          light: '#9B8B7E',     // Light Taupe
          tan: '#C9A57B',       // Primary Tan
          caramel: '#D4A574',   // Caramel Accent
          cream: '#F5F1E8',     // Oatmeal/Ecru
          smoke: '#E8E4DF',     // Humo (Smoke White)
          sage: '#9DAA97',      // Sage Green
          rose: '#D4A5A5',      // Dusty Rose
          slate: '#8B9DAB',     // Slate Blue
          terracotta: '#C98B75' // Soft Terracotta
        },
        // Glassmorphism color palette (mapped to Loewe tones)
        glass: {
          dark: '#3A342F',      // Main BG -> Loewe Darker Taupe
          charcoal: '#4A3F37',  // Card BG -> Loewe Dark Taupe
          lightgray: '#9B8B7E', // Secondary Text -> Loewe Light Taupe
          muted: '#C4CBC9',     // Muted -> Keep slightly cool for contrast or update? Let's keep distinct.
          beige: '#D4A574',     // Accent -> Loewe Caramel
          blue: '#8B9DAB',      // Accent blue -> Loewe Slate
        },
      },
      fontFamily: {
        sans: ['"Noto Sans TC"', 'system-ui', '-apple-system', 'sans-serif'],
        serif: ['"Tenor Sans"', '"Noto Sans TC"', 'system-ui', 'sans-serif'], // §2: serif 僅限報告封面，utility 一律導向 display
      },
      backdropBlur: {
        xs: '2px',
        '3xl': '64px',
      },
      animation: {
        'fade-in': 'fadeIn 0.6s ease-out',
        'slide-up': 'slideUp 0.5s ease-out',
        'scale-in': 'scaleIn 0.3s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
