import { describe, expect, it } from "vitest";

import { toVisibleLedger } from "@/lib/ledger-view";
import type { Transaction } from "@/lib/types";

/**
 * 【做什么】构造列表排序测试需要的最小支出。
 * 【何时调用】验证墓碑过滤和按入账时间倒序时。
 */
function makeRow(partial: Partial<Transaction> & Pick<Transaction, "syncId" | "createdAt">): Transaction {
  return {
    type: "expense",
    amountCents: 100,
    category: "food",
    merchant: "店",
    occurredAt: "2026-08-01T12:00",
    note: "",
    source: "screenshot",
    updatedAt: partial.createdAt,
    ...partial,
  };
}

describe("toVisibleLedger", () => {
  it("按入账时间把最新记的账排到最前，即使交易日更早", () => {
    const visible = toVisibleLedger([
      makeRow({ syncId: "old", createdAt: "2026-09-01T00:00:00.000Z", occurredAt: "2026-09-03T12:00" }),
      makeRow({ syncId: "new", createdAt: "2026-09-03T10:00:00.000Z", occurredAt: "2026-08-01T12:00" }),
    ]);

    expect(visible.map((item) => item.syncId)).toEqual(["new", "old"]);
  });

  it("不展示已删除记录", () => {
    const visible = toVisibleLedger([
      makeRow({ syncId: "live", createdAt: "2026-09-03T00:00:00.000Z" }),
      makeRow({
        syncId: "gone",
        createdAt: "2026-09-03T01:00:00.000Z",
        deletedAt: "2026-09-03T01:00:00.000Z",
      }),
    ]);

    expect(visible.map((item) => item.syncId)).toEqual(["live"]);
  });
});
