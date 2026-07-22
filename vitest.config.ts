import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "core",
          environment: "node",
          include: ["src/core/**/*.test.ts"],
        },
      },
      {
        // 既定は node。DOM が要るテスト(storage/hook)は
        // ファイル冒頭の `// @vitest-environment jsdom` で個別に上書きする。
        test: {
          name: "userscript",
          environment: "node",
          include: ["src/userscript/**/*.test.ts"],
        },
      },
    ],
  },
});
