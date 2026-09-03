import { neon, NeonDbError } from "@neondatabase/serverless";

import type { SessionUser } from "@/lib/auth";
import type { SyncRecord } from "@/lib/types";

type SqlClient = ReturnType<typeof neon>;

type UserRow = {
  id: string;
  email: string;
  password_hash: string;
};

type TransactionRow = {
  sync_id: string;
  type: "expense";
  amount_cents: number;
  category: string;
  merchant: string;
  occurred_at: string;
  note: string;
  source: "manual" | "screenshot";
  image_hash: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

let schemaReady: Promise<void> | null = null;

function getSql(): SqlClient | null {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return null;
  }
  return neon(databaseUrl);
}

/**
 * 【做什么】在首次访问时创建用户表和账目表，避免还要单独跑迁移命令。
 * 【何时调用】任意云端读写之前。
 */
async function ensureSchema(sql: SqlClient): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS tally_users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS tally_transactions (
      sync_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES tally_users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      category TEXT NOT NULL,
      merchant TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL,
      image_hash TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS tally_tx_user_updated
    ON tally_transactions (user_id, updated_at)
  `;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS tally_tx_user_image_hash
    ON tally_transactions (user_id, image_hash)
    WHERE image_hash IS NOT NULL AND deleted_at IS NULL
  `;
}

/**
 * 【做什么】拿到已完成建表的 Neon 查询客户端。
 * 【何时调用】注册、登录查用户，或同步读写账目时。
 */
export async function getCloudSql(): Promise<SqlClient | null> {
  const sql = getSql();
  if (!sql) {
    return null;
  }

  if (!schemaReady) {
    schemaReady = ensureSchema(sql).catch((error: unknown) => {
      schemaReady = null;
      throw error;
    });
  }

  await schemaReady;
  return sql;
}

/**
 * 【做什么】按邮箱查找用户，用于登录校验。
 * 【何时调用】登录接口收到邮箱后。
 */
export async function findUserByEmail(
  sql: SqlClient,
  email: string,
): Promise<(SessionUser & { passwordHash: string }) | null> {
  const rows = (await sql`
    SELECT id, email, password_hash
    FROM tally_users
    WHERE email = ${email}
    LIMIT 1
  `) as UserRow[];
  const row = rows[0];
  if (!row) {
    return null;
  }
  return { id: row.id, email: row.email, passwordHash: row.password_hash };
}

/**
 * 【做什么】写入新用户；邮箱冲突时返回 null。
 * 【何时调用】注册接口通过校验后。
 */
export async function createUser(
  sql: SqlClient,
  user: { id: string; email: string; passwordHash: string },
): Promise<SessionUser | null> {
  try {
    const rows = (await sql`
      INSERT INTO tally_users (id, email, password_hash)
      VALUES (${user.id}, ${user.email}, ${user.passwordHash})
      RETURNING id, email
    `) as Array<Pick<UserRow, "id" | "email">>;
    const row = rows[0];
    return row ? { id: row.id, email: row.email } : null;
  } catch (error) {
    if (error instanceof NeonDbError && error.code === "23505") {
      return null;
    }
    throw error;
  }
}

function rowToSyncRecord(row: TransactionRow): SyncRecord {
  return {
    syncId: row.sync_id,
    type: row.type,
    amountCents: Number(row.amount_cents),
    category: row.category,
    merchant: row.merchant,
    occurredAt: row.occurred_at,
    note: row.note,
    source: row.source,
    imageHash: row.image_hash ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

/**
 * 【做什么】读取某个账号在云端的全部账目，包含删除标记。
 * 【何时调用】同步接口合并完客户端提交后返回最新账本时。
 */
export async function listCloudTransactions(sql: SqlClient, userId: string): Promise<SyncRecord[]> {
  const rows = (await sql`
    SELECT
      sync_id,
      type,
      amount_cents,
      category,
      merchant,
      occurred_at,
      note,
      source,
      image_hash,
      created_at,
      updated_at,
      deleted_at
    FROM tally_transactions
    WHERE user_id = ${userId}
    ORDER BY occurred_at DESC
  `) as TransactionRow[];
  return rows.map(rowToSyncRecord);
}

/**
 * 【做什么】按更新时间把本地快照写入云端；旧版本不会覆盖新版本。
 * 【何时调用】同步接口收到客户端 records 之后。
 */
export async function upsertCloudTransactions(
  sql: SqlClient,
  userId: string,
  records: SyncRecord[],
): Promise<void> {
  for (const record of records) {
    try {
      await sql`
        INSERT INTO tally_transactions (
          sync_id,
          user_id,
          type,
          amount_cents,
          category,
          merchant,
          occurred_at,
          note,
          source,
          image_hash,
          created_at,
          updated_at,
          deleted_at
        )
        VALUES (
          ${record.syncId},
          ${userId},
          ${record.type},
          ${record.amountCents},
          ${record.category},
          ${record.merchant},
          ${record.occurredAt},
          ${record.note},
          ${record.source},
          ${record.imageHash ?? null},
          ${record.createdAt},
          ${record.updatedAt},
          ${record.deletedAt ?? null}
        )
        ON CONFLICT (sync_id) DO UPDATE SET
          type = EXCLUDED.type,
          amount_cents = EXCLUDED.amount_cents,
          category = EXCLUDED.category,
          merchant = EXCLUDED.merchant,
          occurred_at = EXCLUDED.occurred_at,
          note = EXCLUDED.note,
          source = EXCLUDED.source,
          image_hash = EXCLUDED.image_hash,
          created_at = EXCLUDED.created_at,
          updated_at = EXCLUDED.updated_at,
          deleted_at = EXCLUDED.deleted_at
        WHERE tally_transactions.user_id = ${userId}
          AND EXCLUDED.updated_at >= tally_transactions.updated_at
      `;
    } catch (error) {
      // NOTE: 截图指纹冲突说明另一台设备已经记过同一张图，跳过这一笔以免整批同步失败。
      if (error instanceof NeonDbError && error.code === "23505") {
        continue;
      }
      throw error;
    }
  }
}
