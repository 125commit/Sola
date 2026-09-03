import { createAppIconResponse } from "@/lib/pwa-icon";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/**
 * 【做什么】提供浏览器标签页使用的小图标。
 * 【何时调用】Next.js 注入 favicon 链接时。
 */
export default function Icon() {
  return createAppIconResponse(32);
}
