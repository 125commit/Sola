import { NextResponse } from "next/server";

import { getCloudAuthConfig, getSessionUser } from "@/lib/auth";
import { getCloudSql, listCloudTransactions, upsertCloudTransactions } from "@/lib/cloud-db";
import { SyncPushSchema } from "@/lib/sync-record";

export const runtime = "nodejs";

/**
 * 【做什么】把本机账本推到当前账号，再返回云端完整快照。
 * 【何时调用】登录后、账目变更后，或用户点击立即同步时。
 */
export async function POST(request: Request): Promise<NextResponse> {
  const config = getCloudAuthConfig();
  if (!config.ready) {
    return NextResponse.json(
      { ok: false, error: `尚未配置云同步：缺少 ${config.missing.join("、")}` },
      { status: 503 },
    );
  }

  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "请先登录后再同步" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "请求格式无效" }, { status: 400 });
  }

  const parsed = SyncPushSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "同步数据格式无效" }, { status: 400 });
  }

  const sql = await getCloudSql();
  if (!sql) {
    return NextResponse.json({ ok: false, error: "云数据库不可用" }, { status: 503 });
  }

  await upsertCloudTransactions(sql, user.id, parsed.data.records);
  const records = await listCloudTransactions(sql, user.id);
  return NextResponse.json({ ok: true, records });
}

/**
 * 【做什么】只下载当前账号的云端账本，不上传本机改动。
 * 【何时调用】切换账号清空本地后拉取云端数据时。
 */
export async function GET(): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "请先登录后再同步" }, { status: 401 });
  }

  const sql = await getCloudSql();
  if (!sql) {
    return NextResponse.json({ ok: false, error: "云数据库不可用" }, { status: 503 });
  }

  const records = await listCloudTransactions(sql, user.id);
  return NextResponse.json({ ok: true, records });
}
