import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: [],
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['tests/integration/**/*', 'node_modules/**/*', 'dist/**/*'],
    // Run all tests including accessibility-related tests
  },
});
