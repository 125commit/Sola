import type { Metadata, Viewport } from "next";

import "@/app/globals.css";
import { AppNav } from "@/components/app-nav";
import { AuthProvider } from "@/components/auth-provider";
import { PwaInstaller } from "@/components/pwa-installer";
import { PwaRegistrar } from "@/components/pwa-registrar";

export const metadata: Metadata = {
  title: {
    default: "Sola 智能记账",
    template: "%s | Sola",
  },
  description: "截图识别、手动记账与消费习惯分析，登录后可在电脑和手机同步",
  appleWebApp: {
    capable: true,
    title: "Sola",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#12261f",
  colorScheme: "light",
  viewportFit: "cover",
};

/**
 * 【做什么】为所有页面提供统一导航、登录态、PWA 注册和中文文档环境。
 * 【何时调用】Next.js 渲染任意路由时。
 */
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <AuthProvider>
          <PwaRegistrar />
          <PwaInstaller />
          <AppNav />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
