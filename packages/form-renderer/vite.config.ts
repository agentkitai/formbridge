import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'FormBridgeReactRenderer',
      formats: ['es', 'cjs'],
      fileName: (format) => {
        if (format === 'es') return 'index.js';
        if (format === 'cjs') return 'index.cjs';
        return `index.${format}.js`;
      },
    },
    rollupOptions: {
      // Externalize peer dependencies to avoid bundling them
      external: ['react', 'react-dom', 'react/jsx-runtime'],
      output: {
        // Provide global variables for UMD build (if needed in future)
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
          'react/jsx-runtime': 'react/jsx-runtime',
        },
        // Preserve directory structure for better source maps
        preserveModules: false,
        // Ensure CSS is extracted to a separate file
        assetFileNames: (assetInfo) => {
          if (assetInfo.name === 'style.css') return 'style.css';
          return assetInfo.name || 'assets/[name][extname]';
        },
      },
    },
    // Generate source maps for debugging
    sourcemap: true,
    // Clear output directory before build
    emptyOutDir: true,
    // Target modern browsers (ES2020+)
    target: 'es2020',
  },
  // Configure CSS handling
  css: {
    modules: {
      // Generate scoped class names in production
      generateScopedName: '[name]__[local]__[hash:base64:5]',
    },
  },
  // Ensure proper dependency optimization
  optimizeDeps: {
    include: ['ajv', 'ajv-formats'],
    exclude: ['react', 'react-dom'],
  },
});
