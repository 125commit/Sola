"use client";

import Dexie, { type EntityTable } from "dexie";

import { createSyncId } from "@/lib/sync-id";
import { transactionToSyncRecord } from "@/lib/sync-record";
import type { SyncRecord, Transaction, TransactionDraft } from "@/lib/types";

type LedgerListener = () => void;

const ledgerListeners = new Set<LedgerListener>();

/**
 * 【做什么】让界面在账本变更后触发云同步，而不让 db 模块直接依赖登录状态。
 * 【何时调用】AuthProvider 挂载时订阅；卸载时退订。
 */
export function subscribeLedgerChanges(listener: LedgerListener): () => void {
  ledgerListeners.add(listener);
  return () => {
    ledgerListeners.delete(listener);
  };
}

function notifyLedgerChanged() {
  for (const listener of ledgerListeners) {
    listener();
  }
}

/**
 * 【做什么】保存用户设备上的已确认账目。
 * 【何时使用】页面读取、添加、编辑或删除流水时；原始截图从不进入此数据库。
 */
class TallyDatabase extends Dexie {
  transactions!: EntityTable<Transaction, "id">;

  constructor() {
    super("tally-ledger");
    this.version(1).stores({
      transactions: "++id, occurredAt, type, category, imageHash, createdAt",
    });
    // CHANGED: v2 增加 syncId / deletedAt，使同一笔账能在电脑和手机对齐，删除也能同步。
    this.version(2)
      .stores({
        transactions: "++id, syncId, occurredAt, type, category, imageHash, createdAt, updatedAt, deletedAt",
      })
      .upgrade(async (transaction) => {
        await transaction
          .table("transactions")
          .toCollection()
          .modify((row: Transaction) => {
            if (!row.syncId) {
              row.syncId = createSyncId();
            }
          });
      });
  }
}

export const db = new TallyDatabase();

/** 截图哈希已存在时抛出此错误，阻止同一张截图被重复确认。 */
export class DuplicateImageError extends Error {
  constructor() {
    super("这张截图已经记过账了");
    this.name = "DuplicateImageError";
  }
}

function isActive(transaction: Transaction): boolean {
  return !transaction.deletedAt;
}

/**
 * 【做什么】读取尚未删除的支出，供总览和分析的实时订阅使用。
 * 【何时调用】Dashboard / AnalysisDashboard 的 useLiveQuery 工厂里。
 */
export function queryActiveTransactions(): Promise<Transaction[]> {
  return db.transactions
    .orderBy("occurredAt")
    .reverse()
    .filter((item) => isActive(item))
    .toArray();
}

/**
 * 【做什么】校验并写入一笔用户已确认的支出。
 * 【何时调用】手动表单或截图预填表单点击“确认记账”后。
 */
export async function addTransaction(draft: TransactionDraft): Promise<number> {
  if (draft.type !== "expense") {
    throw new Error("当前版本只支持记录支出");
  }
  if (!Number.isInteger(draft.amountCents) || draft.amountCents <= 0) {
    throw new Error("金额必须大于 0 且精确到分");
  }

  return db.transaction("rw", db.transactions, async () => {
    // WARN: 同一截图重复提交时拒绝写入，避免月度统计被悄悄放大。
    if (draft.imageHash) {
      const existing = await db.transactions
        .where("imageHash")
        .equals(draft.imageHash)
        .and((item) => isActive(item))
        .first();
      if (existing) {
        throw new DuplicateImageError();
      }
    }

    const now = new Date().toISOString();
    const id = await db.transactions.add({
      ...draft,
      syncId: createSyncId(),
      createdAt: now,
      updatedAt: now,
    });

    // WARN: 自动主键理论上总会返回；显式守卫可避免底层存储异常被当成保存成功。
    if (id === undefined) {
      throw new Error("本地账本未能生成记录编号");
    }
    notifyLedgerChanged();
    return id;
  });
}

/**
 * 【做什么】把同一张截图确认出的多笔支出放在一个事务中批量写入。
 * 【何时调用】用户核对批量识别结果并点击“一次记入”后。
 * 【副作用】任意一笔校验或写入失败时全部回滚，避免只保存半张截图。
 */
export async function addScreenshotTransactions(
  drafts: TransactionDraft[],
  imageHash: string,
): Promise<number[]> {
  if (drafts.length === 0 || drafts.length > 50) {
    throw new Error("每次需要确认 1 至 50 笔支出");
  }
  if (
    drafts.some(
      (draft) =>
        draft.type !== "expense" ||
        !Number.isInteger(draft.amountCents) ||
        draft.amountCents <= 0,
    )
  ) {
    throw new Error("批量截图只能写入金额有效的支出");
  }

  return db.transaction("rw", db.transactions, async () => {
    const exactMatch = await db.transactions
      .where("imageHash")
      .equals(imageHash)
      .and((item) => isActive(item))
      .first();
    const batchMatch = await db.transactions
      .where("imageHash")
      .startsWith(`${imageHash}:`)
      .and((item) => isActive(item))
      .first();

    // WARN: 整张截图只允许确认一次；批次后缀用于让同图中的多笔流水共存。
    if (exactMatch || batchMatch) {
      throw new DuplicateImageError();
    }

    const now = new Date().toISOString();
    const ids: number[] = [];
    for (const [index, draft] of drafts.entries()) {
      const id = await db.transactions.add({
        ...draft,
        syncId: createSyncId(),
        imageHash: `${imageHash}:${index}`,
        createdAt: now,
        updatedAt: now,
      });
      if (id === undefined) {
        throw new Error("本地账本未能生成记录编号");
      }
      ids.push(id);
    }
    notifyLedgerChanged();
    return ids;
  });
}

/**
 * 【做什么】用确认后的表单内容覆盖指定支出的可编辑字段。
 * 【何时调用】用户在首页修改历史账目并保存时。
 */
export async function updateTransaction(id: number, draft: TransactionDraft): Promise<void> {
  if (draft.type !== "expense") {
    throw new Error("当前版本只支持记录支出");
  }
  if (!Number.isInteger(draft.amountCents) || draft.amountCents <= 0) {
    throw new Error("金额必须大于 0 且精确到分");
  }

  const updated = await db.transactions.update(id, {
    ...draft,
    updatedAt: new Date().toISOString(),
  });

  // WARN: 流水可能已在另一个标签页删除；明确报错比假装保存成功更安全。
  if (updated === 0) {
    throw new Error("这笔账已不存在，请刷新后重试");
  }
  notifyLedgerChanged();
}

/**
 * 【做什么】把一笔支出标为删除，保留编号以便同步到其他设备。
 * 【何时调用】用户在流水编辑界面二次确认删除后。
 */
export async function deleteTransaction(id: number): Promise<void> {
  const existing = await db.transactions.get(id);
  if (!existing) {
    return;
  }

  // CHANGED: 原先直接从 IndexedDB 抹掉 → 改为写入 deletedAt，否则其他设备无法知道要删哪一笔。
  await db.transactions.update(id, {
    deletedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  notifyLedgerChanged();
}

/**
 * 【做什么】检查截图是否已经入账。
 * 【何时调用】识别完成后、用户填写表单前，用于尽早展示重复提醒。
 */
export async function hasImageHash(imageHash: string): Promise<boolean> {
  const exact = await db.transactions
    .where("imageHash")
    .equals(imageHash)
    .and((item) => isActive(item))
    .first();
  if (exact) {
    return true;
  }
  const batched = await db.transactions
    .where("imageHash")
    .startsWith(`${imageHash}:`)
    .and((item) => isActive(item))
    .first();
  return Boolean(batched);
}

/**
 * 【做什么】导出本地全部账目快照，包含墓碑，供上传到云端。
 * 【何时调用】登录后或账本变更后执行同步推送时。
 */
export async function listSyncRecords(): Promise<SyncRecord[]> {
  const rows = await db.transactions.toArray();
  return rows.map(transactionToSyncRecord);
}

/**
 * 【做什么】用云端返回的账本覆盖本地对应 syncId 的记录。
 * 【何时调用】同步接口成功返回完整快照后。
 */
export async function applyRemoteRecords(records: SyncRecord[]): Promise<void> {
  await db.transaction("rw", db.transactions, async () => {
    const existing = await db.transactions.toArray();
    const bySyncId = new Map(
      existing.filter((row) => row.syncId).map((row) => [row.syncId, row]),
    );

    for (const record of records) {
      const local = bySyncId.get(record.syncId);
      const fields: Omit<Transaction, "id"> = {
        syncId: record.syncId,
        type: record.type,
        amountCents: record.amountCents,
        category: record.category,
        merchant: record.merchant,
        occurredAt: record.occurredAt,
        note: record.note,
        source: record.source,
        imageHash: record.imageHash,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        deletedAt: record.deletedAt ?? undefined,
      };

      if (local?.id !== undefined) {
        await db.transactions.update(local.id, fields);
      } else {
        await db.transactions.add(fields);
      }
    }
  });
}

/**
 * 【做什么】清空本机账本，避免把上一个账号的支出上传到新账号。
 * 【何时调用】同一浏览器改用另一个邮箱登录时。
 */
export async function clearLocalLedger(): Promise<void> {
  await db.transactions.clear();
}
