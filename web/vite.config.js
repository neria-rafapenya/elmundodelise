import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// Dos aplicaciones en el mismo build: tienda (/) y backoffice (/admin/)
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        shop: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin/index.html'),
      },
    },
  },
  server: {
    // En desarrollo, la API Node corre en el 3002
    proxy: { '/api': 'http://127.0.0.1:3002', '/uploads': 'http://127.0.0.1:3002' },
  },
});
