import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: { target: 'es2022', assetsInlineLimit: 0, chunkSizeWarningLimit: 900 },
  server: { port: 5173 },
  test: { include: ['test/**/*.test.ts'], testTimeout: 60000 },
});
