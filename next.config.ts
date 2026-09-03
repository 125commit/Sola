import type { NextConfig } from "next";

/** 保持初版配置精简，PWA 的 manifest 与 service worker 由 public 目录托管。 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
