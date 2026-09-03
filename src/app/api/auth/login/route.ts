import { NextResponse } from "next/server";

import { createSession, getCloudAuthConfig, verifyPassword } from "@/lib/auth";
import { AuthCredentialsSchema, formatAuthError } from "@/lib/auth-schema";
import { findUserByEmail, getCloudSql } from "@/lib/cloud-db";

export const runtime = "nodejs";

/**
 * 【做什么】校验邮箱密码并写入登录会话。
 * 【何时调用】账号页提交“登录”时。
 */
export async function POST(request: Request): Promise<NextResponse> {
  const config = getCloudAuthConfig();
  if (!config.ready) {
    return NextResponse.json(
      { ok: false, error: `尚未配置云同步：缺少 ${config.missing.join("、")}` },
      { status: 503 },
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "请求格式无效" }, { status: 400 });
  }

  const parsed = AuthCredentialsSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: formatAuthError(parsed.error) }, { status: 400 });
  }

  const sql = await getCloudSql();
  if (!sql) {
    return NextResponse.json({ ok: false, error: "云数据库不可用" }, { status: 503 });
  }

  const user = await findUserByEmail(sql, parsed.data.email);
  // WARN: 邮箱不存在和密码错误返回同一句话，避免被用来枚举已注册账号。
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return NextResponse.json({ ok: false, error: "邮箱或密码不正确" }, { status: 401 });
  }

  await createSession({ id: user.id, email: user.email });
  return NextResponse.json({ ok: true, user: { id: user.id, email: user.email } });
}
