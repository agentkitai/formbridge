import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@formbridge/form-renderer': resolve(__dirname, '../form-renderer/src/index.ts'),
    },
  },
  server: {
    port: 3001,
    host: '0.0.0.0',
    open: false,
    proxy: {
      '/intake': 'http://localhost:3000',
      '/health': 'http://localhost:3000',
      '/submissions': 'http://localhost:3000',
      '/approvals': 'http://localhost:3000',
      '/analytics': 'http://localhost:3000',
      '/webhooks': 'http://localhost:3000',
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2020',
  },
  optimizeDeps: {
    include: ['react', 'react-dom'],
  },
});
