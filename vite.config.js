import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // Custom domain (learn.adititracking.com) serves the app at root — unlike the earlier GitHub
  // Pages project-page default URL (aditi-tracking.github.io/aditi-migration/), which needed
  // assets to resolve under that subpath instead.
  base: '/',
  plugins: [react(), tailwindcss()],
})