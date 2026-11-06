import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.VITE_BASE ?? "/",
  server: { port: 3000, strictPort: true },
  plugins: [
    tanstackRouter({ routesDirectory: "src/pages", target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
});
