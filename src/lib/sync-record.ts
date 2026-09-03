import { z } from "zod";

import { createSyncId } from "@/lib/sync-id";
import type { SyncRecord, Transaction } from "@/lib/types";

/**
 * 【做什么】约束客户端上传的账目快照，防止把无效金额或超长字段写入云端。
 * 【何时使用】`POST /api/sync` 解析请求体时。
 */
export const SyncRecordSchema = z
  .object({
    syncId: z.string().min(8).max(80),
    type: z.literal("expense"),
    amountCents: z.number().int().positive().max(100_000_000),
    category: z.string().min(1).max(40),
    merchant: z.string().max(120),
    occurredAt: z.string().min(8).max(40),
    note: z.string().max(240),
    source: z.enum(["manual", "screenshot"]),
    imageHash: z.string().min(16).max(140).optional(),
    createdAt: z.string().min(10).max(40),
    updatedAt: z.string().min(10).max(40),
    deletedAt: z.string().min(10).max(40).nullable().optional(),
  })
  .strict();

export const SyncPushSchema = z
  .object({
    records: z.array(SyncRecordSchema).max(2000),
  })
  .strict();

/**
 * 【做什么】把本地 IndexedDB 行转成可上传的同步快照。
 * 【何时调用】登录后推送本地账本，或账目变更后后台同步时。
 */
export function transactionToSyncRecord(transaction: Transaction): SyncRecord {
  return {
    syncId: transaction.syncId || createSyncId(),
    type: transaction.type,
    amountCents: transaction.amountCents,
    category: transaction.category,
    merchant: transaction.merchant,
    occurredAt: transaction.occurredAt,
    note: transaction.note,
    source: transaction.source,
    imageHash: transaction.imageHash,
    createdAt: transaction.createdAt,
    updatedAt: transaction.updatedAt,
    deletedAt: transaction.deletedAt ?? null,
  };
}
