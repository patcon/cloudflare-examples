import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import agents from "agents/vite";
import { defineConfig } from "vite";

export default defineConfig({
  // `agents()` compiles `@callable()`, which Vite can't yet.
  plugins: [agents(), react(), cloudflare(), tailwindcss()],
  server: {
    // Each example has its own port, so they can run side by side.
    port: 8799,
    strictPort: true,
  },
});
