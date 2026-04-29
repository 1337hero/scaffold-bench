import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync } from "node:fs";
import { resolve } from "path";

const pkg = JSON.parse(readFileSync(resolve(__dirname, "package.json"), "utf-8")) as {
  version?: string;
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version ?? "dev"),
  },
  resolve: { alias: { "@": resolve(__dirname, "src") } },
  server: {
    host: true,
    port: 5173,
    proxy: { "/api": "http://localhost:4317" },
  },
});
