import type { MetadataRoute } from "next";

/**
 * 【做什么】声明独立窗口、主题色和安装图标，让手机可以把站点加到主屏幕。
 * 【何时调用】浏览器读取 Web App Manifest 判断能否安装时。
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Sola 智能记账",
    short_name: "Sola",
    description: "截图识别、手动记账，登录后可在电脑和手机同步账本",
    start_url: "/?source=pwa",
    scope: "/",
    id: "/",
    display: "standalone",
    display_override: ["standalone", "browser"],
    background_color: "#f4f1e8",
    theme_color: "#12261f",
    lang: "zh-CN",
    categories: ["finance", "productivity"],
    prefer_related_applications: false,
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
