import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// The site is served from https://aflah99.github.io/alam-altahaddi/,
// so every built asset URL must be prefixed with the repository name.
export default defineConfig({
  base: '/alam-altahaddi/',
  plugins: [react()],
})
