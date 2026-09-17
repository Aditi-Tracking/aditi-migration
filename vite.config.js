import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // GitHub Pages project-page default URL (github.com/Aditi-Tracking/aditi-migration ->
  // aditi-tracking.github.io/aditi-migration/) — no custom domain yet, so assets must resolve
  // under this subpath, not root. Revisit if/when a custom domain (root path) goes live.
  base: '/aditi-migration/',
  plugins: [react(), tailwindcss()],
})