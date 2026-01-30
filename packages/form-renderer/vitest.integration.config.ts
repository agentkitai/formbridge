import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: [],
    include: ['tests/integration/**/*.test.{ts,tsx}'],
    exclude: ['node_modules/**/*', 'dist/**/*', 'src/**/*'],
    testTimeout: 10000, // Integration tests may take longer
  },
});
