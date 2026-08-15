import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createSwitchboardApi } from "./server/api.js";

function switchboardApiPlugin() {
  return {
    name: "dsh-switchboard-api",
    configureServer(server) {
      const api = createSwitchboardApi();
      server.middlewares.use(api.handler);
      server.httpServer?.once("close", () => api.close());
    },
  };
}

export default defineConfig({
  build: {
    outDir: "dist/client",
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local", "localhost", "127.0.0.1"],
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [switchboardApiPlugin(), react()],
});
