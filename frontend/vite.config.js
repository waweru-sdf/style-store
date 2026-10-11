import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// In dev, /api is proxied to the Flask server so the browser never needs CORS.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:5000',
    },
  },
})
