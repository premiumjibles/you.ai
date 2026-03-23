import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 15000,
    hookTimeout: 30000,
    env: {
      OPENAI_API_KEY: process.env.OPENAI_API_KEY || "test-key",
    },
  },
});
