import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
export default defineConfig({
  plugins: [vue()],
  server: { host: '127.0.0.1', port: Number(process.env.PORT) || 5173 },
  build: { rollupOptions: { output: { manualChunks(id) {
    if (id.includes('ammojs-typed')) return 'physics'
    if (id.includes('/node_modules/three/')) return 'three'
    if (id.includes('/node_modules/postprocessing/') || id.includes('/node_modules/n8ao/')) return 'effects'
    if (id.includes('/node_modules/')) return 'runtime'
  } } } },
})
