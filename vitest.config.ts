import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/tests/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/domain/**", "src/infra/**"],
      exclude: ["src/tests/**"],
    },
  },
  resolve: {
    alias: {
      "@domain": resolve("src/domain"),
      "@infra": resolve("src/infra"),
      "@presentation": resolve("src/presentation"),
      "@shared": resolve("src/shared"),
    },
  },
});
