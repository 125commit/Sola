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

    // NOTE: 注册失败不阻断账本使用，联网页面和 IndexedDB 仍然独立可用。
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);

  return null;
}
