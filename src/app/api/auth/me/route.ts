import { NextResponse } from "next/server";

import { getCloudAuthConfig, getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * 【做什么】告诉前端当前是否已登录，以及云同步环境变量是否就绪。
 * 【何时调用】应用启动或账号页刷新登录状态时。
 */
export async function GET(): Promise<NextResponse> {
  const config = getCloudAuthConfig();
  const user = await getSessionUser();
  return NextResponse.json({
    ok: true,
    cloudReady: config.ready,
    missing: config.missing,
    user: user ? { id: user.id, email: user.email } : null,
  });
}
