import { NextResponse } from "next/server";

import { createSession, getCloudAuthConfig, hashPassword } from "@/lib/auth";
import { AuthCredentialsSchema, formatAuthError } from "@/lib/auth-schema";
import { createUser, findUserByEmail, getCloudSql } from "@/lib/cloud-db";
import { createSyncId } from "@/lib/sync-id";

export const runtime = "nodejs";

/**
 * 【做什么】用邮箱和密码创建账号并写入登录会话。
 * 【何时调用】账号页提交“注册”时。
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

  const existing = await findUserByEmail(sql, parsed.data.email);
  if (existing) {
    return NextResponse.json({ ok: false, error: "该邮箱已注册，请直接登录" }, { status: 409 });
  }

  const user = await createUser(sql, {
    id: createSyncId(),
    email: parsed.data.email,
    passwordHash: await hashPassword(parsed.data.password),
  });
  if (!user) {
    return NextResponse.json({ ok: false, error: "该邮箱已注册，请直接登录" }, { status: 409 });
  }

  await createSession(user);
  return NextResponse.json({ ok: true, user: { id: user.id, email: user.email } });
}
