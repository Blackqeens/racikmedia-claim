/**
 * tailwind-config.js — Racik Media Nusantara (BOB)
 * Satu file konfigurasi Tailwind untuk semua halaman.
 * Muat SETELAH <script src="https://cdn.tailwindcss.com"></script>.
 */
tailwind.config = {
  theme: {
    extend: {
      fontFamily: {
        serif: ['Lora', 'Georgia', 'serif'],
        sans:  ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        emerald: {
          50:  '#ecfdf5',
          100: '#d1fae5',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
        }
      },
      letterSpacing: { widest: '0.2em' }
    }
  }
};
