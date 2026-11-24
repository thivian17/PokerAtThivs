import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist/public", emptyOutDir: true },
  worker: { format: "es" },
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: { "/api": "http://localhost:3000" },
  },
  test: { include: ["src/**/*.test.ts"], testTimeout: 60000 },
} as any);
