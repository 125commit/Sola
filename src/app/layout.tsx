import type { Metadata, Viewport } from "next";

import "@/app/globals.css";
import { AppNav } from "@/components/app-nav";
import { PwaRegistrar } from "@/components/pwa-registrar";

export const metadata: Metadata = {
  title: {
    default: "Tally 智能记账",
    template: "%s | Tally",
  },
  description: "截图识别、手动记账与消费习惯分析",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#12261f",
  colorScheme: "light",
};

/**
 * 【做什么】为所有页面提供统一导航、PWA 注册和中文文档环境。
 * 【何时调用】Next.js 渲染任意路由时。
 */
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <PwaRegistrar />
        <AppNav />
        {children}
      </body>
    </html>
  );
}
