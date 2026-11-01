import { defineConfig } from "vitest/config";

export default defineConfig({ test: { include: ["adapters/*/tests/**/*.test.ts", "core/**/*.test.ts"], environment: "node", testTimeout: 60000 } });
