import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    // This makes the environment variable available in your code
    'process.env.API_KEY': JSON.stringify(process.env.VITE_API_KEY)
  },
  build: {
    outDir: 'build'
  }
})
