import { defineConfig } from "vitest/config";

// Separate from vite.config.ts, so the tests don't start the Cloudflare
// plugin: math.ts and polis-csv.ts are pure and run under plain Node.
export default defineConfig({
  test: { include: ["test/**/*.test.ts"] },
});
