import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3002,
    proxy: {
      '/intake': 'http://localhost:3000',
      '/intakes': 'http://localhost:3000',
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
  },
});
