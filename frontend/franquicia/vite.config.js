import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// SPA de franquicia + login único. Se sirve en la raíz / a través del gateway.
export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5174,
    allowedHosts: true,
    hmr: { clientPort: 8080 },
  },
})
