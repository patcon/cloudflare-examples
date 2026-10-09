import { defineConfig } from "vitest/config";

// The pure functions only. The agents run in `pnpm dev`.
export default defineConfig({
  // Each test sits beside the file it tests.
  test: { include: ["src/**/*.test.ts"] },
});
