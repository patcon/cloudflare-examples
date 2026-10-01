import { defineConfig } from "vitest/config";

// The pure functions only. The agents run in `pnpm dev`.
export default defineConfig({
  test: { include: ["test/**/*.test.ts"] }
});
