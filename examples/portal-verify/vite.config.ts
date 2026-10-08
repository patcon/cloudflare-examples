import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
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
    tailwindcss(),
  ],
  server: {
    // Each example has its own port, so they can run side by side.
    port: 8796,
    strictPort: true,
    // Listens on every network, as `--host` does, so other devices can reach it.
    host: true,
    // `.ts.net` lets a phone on your tailnet reach it over HTTPS, through
    // `tailscale serve --bg 8796`. The microphone needs HTTPS.
    allowedHosts: [".ts.net"],
  },
}));
