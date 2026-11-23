import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    projects: [
      {
        test: { name: 'unit', include: ['test/unit/**/*.test.ts'] },
      },
      {
        test: {
          name: 'integration',
          include: ['test/integration/**/*.test.ts'],
          globalSetup: ['test/global-setup.ts'],
          // One shared database: run files one after another.
          fileParallelism: false,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
