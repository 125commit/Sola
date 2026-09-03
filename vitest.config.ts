import { defineConfig } from "vitest/config";

/** 统计与协议测试均为纯函数，因此使用轻量 Node 环境即可。 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
});
