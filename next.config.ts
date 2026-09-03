import type { NextConfig } from "next";

/**
 * 【做什么】保持配置精简，并为 service worker 关闭长期缓存。
 * 【原因】Vercel 若把 sw.js 缓存太久，手机上的已安装应用会一直用旧脚本，表现为“装不上/离线壳过期”。
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
