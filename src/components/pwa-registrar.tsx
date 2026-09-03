"use client";

import { useEffect } from "react";

/**
 * 【做什么】在支持的浏览器中注册离线外壳。
 * 【何时调用】根布局首次挂载后；开发环境不注册，避免旧缓存干扰调试。
 */
export function PwaRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) {
      return;
    }

    // NOTE: updateViaCache 关掉 HTTP 缓存，避免 Vercel 把旧的 sw.js 一直留给已安装用户。
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch(() => undefined);
  }, []);

  return null;
}
