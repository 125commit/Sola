"use client";

import Dexie, { type EntityTable } from "dexie";

import type { Transaction, TransactionDraft } from "@/lib/types";

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
      const existing = await db.transactions.where("imageHash").equals(draft.imageHash).first();
      if (existing) {
        throw new DuplicateImageError();
      }
    }

    const now = new Date().toISOString();
    const id = await db.transactions.add({
      ...draft,
      createdAt: now,
      updatedAt: now,
    });

    // WARN: 自动主键理论上总会返回；显式守卫可避免底层存储异常被当成保存成功。
    if (id === undefined) {
      throw new Error("本地账本未能生成记录编号");
    }
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
    const exactMatch = await db.transactions.where("imageHash").equals(imageHash).first();
    const batchMatch = await db.transactions
      .where("imageHash")
      .startsWith(`${imageHash}:`)
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
        imageHash: `${imageHash}:${index}`,
        createdAt: now,
        updatedAt: now,
      });
      if (id === undefined) {
        throw new Error("本地账本未能生成记录编号");
      }
      ids.push(id);
    }
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
}

/**
 * 【做什么】永久删除一笔本地流水。
 * 【何时调用】用户在流水编辑界面二次确认删除后。
 */
export async function deleteTransaction(id: number): Promise<void> {
  await db.transactions.delete(id);
}

/**
 * 【做什么】检查截图是否已经入账。
 * 【何时调用】识别完成后、用户填写表单前，用于尽早展示重复提醒。
 */
export async function hasImageHash(imageHash: string): Promise<boolean> {
  const exactCount = await db.transactions.where("imageHash").equals(imageHash).count();
  if (exactCount > 0) {
    return true;
  }
  return (await db.transactions.where("imageHash").startsWith(`${imageHash}:`).count()) > 0;
}
