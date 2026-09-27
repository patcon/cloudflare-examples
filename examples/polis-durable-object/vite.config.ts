import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [react(), cloudflare()],
  // Each example has its own port, so they can run side by side. strictPort
  // fails instead of quietly moving to the next free port.
  server: { port: 8790, strictPort: true },
  preview: { port: 8790, strictPort: true },
});
