import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "worker",
          environment: "node",
          include: ["src/worker/**/*.test.ts", "src/shared/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "app",
          environment: "jsdom",
          include: ["src/app/**/*.test.ts", "src/app/**/*.test.tsx"],
          setupFiles: ["./vitest.setup.ts"],
        },
      },
    ],
  },
});
