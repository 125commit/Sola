import { NextResponse } from "next/server";

import { clearSession } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * 【做什么】退出当前登录会话，不影响本机 IndexedDB 里的账。
 * 【何时调用】账号页点击退出时。
 */
export async function POST(): Promise<NextResponse> {
  await clearSession();
  return NextResponse.json({ ok: true });
}
