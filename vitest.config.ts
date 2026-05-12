import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// Dedicated Vitest config so `npm run test` runs in Node without spinning up
// the entire vite + tanstack plugin stack (which requires a browser-like env).
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: ["src/routes/*.tsx", "src/routes/*.ts", "node_modules/**", "dist/**", ".tanstack/**"],
  },
});
