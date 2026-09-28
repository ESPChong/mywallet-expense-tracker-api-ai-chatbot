import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/tests/**/*.test.ts'],
    globalSetup: './src/tests/global-setup.ts',
    setupFiles: ['./src/tests/setup.ts'],
    env: { TZ: 'UTC' },
    fileParallelism: false,
  },
  css: {
    postcss: {},
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      'next/headers': path.resolve(__dirname, 'src/tests/mocks/next-headers.ts'),
    },
  },
});
