import type { MetadataRoute } from "next";

/**
 * 【做什么】声明独立窗口、主题色和安装图标，让手机可以把站点加到主屏幕。
 * 【何时调用】浏览器读取 Web App Manifest 判断能否安装时。
 * 【原因】字段尽量保守：id 与 start_url 一致，避免 Android WebAPK 打包卡死。
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Sola 智能记账",
    short_name: "Sola",
    description: "截图识别、手动记账，登录后可在电脑和手机同步账本",
    // CHANGED: 与 id 对齐为 "/"。带 query 的 start_url 曾导致部分机型 WebAPK 一直「正在安装」。
    start_url: "/",
    scope: "/",
    id: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#f4f1e8",
    theme_color: "#12261f",
    lang: "zh-CN",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
