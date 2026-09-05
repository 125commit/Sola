"use client";

/**
 * 【做什么】兼容旧导入路径；实际逻辑已合并到 pwa-install。
 * 【何时调用】若仍有文件引用 PwaInstaller。
 * @deprecated 请改用 PwaInstallBanner / PwaInstallProvider
 */
export { PwaInstallBanner as PwaInstaller } from "@/components/pwa-install";
