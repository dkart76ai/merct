import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3001
  },
  optimizeDeps: {
    // Esto obliga a Vite a procesar tu librería CJS local
    include: ['message-pack']
  },
  build: {
    commonjsOptions: {
      // Asegura que el plugin de Rollup también la procese en producción
      include: [/message-pack/, /node_modules/]
    }
  }
})
