import { describe, expect, it } from "vitest";

import { isActiveSyncRecord, mergeLedger } from "@/lib/sync-merge";
import type { SyncRecord } from "@/lib/types";

/**
 * 【做什么】构造同步测试需要的最小支出快照。
 * 【何时调用】验证合并与墓碑过滤时。
 */
function makeRecord(syncId: string, updatedAt: string, extra: Partial<SyncRecord> = {}): SyncRecord {
  return {
    syncId,
    type: "expense",
    amountCents: 1200,
    category: "food",
    merchant: "店",
    occurredAt: "2026-09-01T12:00",
    note: "",
    source: "manual",
    createdAt: "2026-09-01T04:00:00.000Z",
    updatedAt,
    ...extra,
  };
}

describe("mergeLedger", () => {
  it("同一笔账保留更新时间更晚的版本", () => {
    const local = [makeRecord("a", "2026-09-02T00:00:00.000Z", { amountCents: 100 })];
    const remote = [makeRecord("a", "2026-09-03T00:00:00.000Z", { amountCents: 200 })];
    expect(mergeLedger(local, remote)[0]?.amountCents).toBe(200);
  });

  it("两台设备各自新增的支出都会保留", () => {
    const merged = mergeLedger(
      [makeRecord("phone", "2026-09-02T00:00:00.000Z")],
      [makeRecord("laptop", "2026-09-02T00:00:00.000Z")],
    );
    expect(merged.map((item) => item.syncId).sort()).toEqual(["laptop", "phone"]);
  });

  it("删除标记也参与后写入获胜", () => {
    const merged = mergeLedger(
      [makeRecord("a", "2026-09-02T00:00:00.000Z")],
      [makeRecord("a", "2026-09-04T00:00:00.000Z", { deletedAt: "2026-09-04T00:00:00.000Z" })],
    );
    expect(isActiveSyncRecord(merged[0]!)).toBe(false);
  });
});
