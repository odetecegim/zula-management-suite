import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // GitHub Pages alt klasorde de (/<repo>/) calissin diye
  // tum asset yollari goreli uretilir.
  base: './',
  // Google Sheets API istekleri backend proxy'ye gider
  // (servis hesabi anahtari frontend'de tutulmaz)
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
})
