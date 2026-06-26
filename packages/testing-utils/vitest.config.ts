import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    watch: false,
    mockReset: true,
    pool: "threads",
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts"],
      thresholds: {
        lines: 90,
        functions: 100,
        branches: 85,
        statements: 90,
      },
    },
    typecheck: {
      enabled: true,
      include: ["src/**/*.spec.ts"],
    },
  },
});
