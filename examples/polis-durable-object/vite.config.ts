import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

// `--mode share` (pnpm dev:share, pnpm preview:share) also opens a public
// link to this machine, through a Cloudflare Quick Tunnel, so people at an
// event can join from their phones. Without it, press `t` then Enter to open
// one. https://developers.cloudflare.com/workers/local-development/local-dev-tunnels/
export default defineConfig(({ mode }) => ({
  plugins: [react(), cloudflare({ tunnel: { autoStart: mode === "share" } })],
  // Each example has its own port, so they can run side by side. strictPort
  // fails instead of quietly moving to the next free port.
  server: { port: 8790, strictPort: true },
  // Vite's preview server only answers hostnames it knows, so allow the
  // Quick Tunnel's.
  preview: { port: 8790, strictPort: true, allowedHosts: [".trycloudflare.com"] },
}));
