import { resolve } from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import agents from "agents/vite";
import { defineConfig } from "vite";

// `--mode share` (pnpm dev:share) also opens a public link to this machine,
// through a Cloudflare Quick Tunnel, to try it from a phone. Without it, press
// `t` then Enter to open one.
// https://developers.cloudflare.com/workers/local-development/local-dev-tunnels/
export default defineConfig(({ mode }) => ({
  plugins: [
    // Compiles `@callable()`, which Vite can't yet.
    agents(),
    react(),
    cloudflare({ tunnel: { autoStart: mode === "share" } }),
  ],
  // Tailwind 3 and Mantine's PostCSS preset run from postcss.config.js, as in echo.
  resolve: {
    alias: {
      // The files copied from echo import its src/ as `@/`, and Lingui's
      // macros, its router and its analytics, which shims stand in for.
      "@/": `${resolve(import.meta.dirname, "src/client/dembrane")}/`,
      "@lingui/core/macro": resolve(
        import.meta.dirname,
        "src/client/dembrane/shims/lingui-core-macro.ts",
      ),
      "react-router": resolve(import.meta.dirname, "src/client/dembrane/shims/react-router.tsx"),
      "posthog-js": resolve(import.meta.dirname, "src/client/dembrane/shims/posthog.ts"),
      "@lingui/react/macro": resolve(
        import.meta.dirname,
        "src/client/dembrane/shims/lingui-react-macro.tsx",
      ),
    },
  },
  server: {
    // Each example has its own port, so they can run side by side.
    port: 8798,
    strictPort: true,
    // Listens on every network, as `--host` does, so other devices can reach it.
    host: true,
    // `.ts.net` lets a phone on your tailnet reach it over HTTPS, through
    // `tailscale serve --bg 8798`. The microphone needs HTTPS.
    allowedHosts: [".ts.net"],
  },
}));
