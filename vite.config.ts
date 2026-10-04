import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
export default defineConfig({
  plugins: [vue()],
  base: './',
  server: { port: 5186, strictPort: true },
})
