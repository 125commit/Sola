import { createAppIconResponse } from "@/lib/pwa-icon";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/**
 * 【做什么】提供 iOS“添加到主屏幕”所需的 PNG 触控图标。
 * 【何时调用】Safari 读取 apple-touch-icon 时。
 */
export default function AppleIcon() {
  return createAppIconResponse(180);
}
