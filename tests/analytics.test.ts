import { describe, expect, it } from "vitest";

import {
  compareWithPreviousMonth,
  getPreviousMonthKey,
  summarizeMonth,
  yuanToCents,
} from "@/lib/analytics";
import type { Transaction } from "@/lib/types";

/**
 * 【做什么】构造统计测试需要的最小支出流水。
 * 【何时调用】每个测试场景创建不同月份或类别的账目时。
 */
function makeTransaction(
  occurredAt: string,
  amountCents: number,
  category = "food",
): Transaction {
  return {
    id: Math.floor(Math.random() * 100_000),
    syncId: "sync-test",
    type: "expense",
    amountCents,
    category,
    merchant: "",
    occurredAt,
    note: "",
    source: "manual",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("yuanToCents", () => {
  it("把最多两位小数的元安全转换为分", () => {
    expect(yuanToCents("19.90")).toBe(1990);
    expect(yuanToCents("0.01")).toBe(1);
  });

  it("拒绝零、负数和超过两位小数", () => {
    expect(yuanToCents("0")).toBeNull();
    expect(yuanToCents("-1")).toBeNull();
    expect(yuanToCents("1.009")).toBeNull();
  });
});

describe("summarizeMonth", () => {
  it("只汇总支出总额和类别占比", () => {
    const summary = summarizeMonth(
      [
        makeTransaction("2026-09-02T12:00", 2000, "food"),
        makeTransaction("2026-09-03T12:00", 1000, "transport"),
        makeTransaction("2026-08-31T12:00", 9999),
      ],
      "2026-09",
    );

    expect(summary.expenseCents).toBe(3000);
    expect(summary.transactionCount).toBe(2);
    expect(summary.categorySpending[0]).toMatchObject({
      category: "food",
      amountCents: 2000,
    });
    expect(summary.categorySpending[0].share).toBeCloseTo(2 / 3);
  });

  it("忽略本地残留的非支出记录", () => {
    const legacyIncome = {
      ...makeTransaction("2026-09-05T12:00", 5000, "salary"),
      type: "income",
    } as unknown as Transaction;

    const summary = summarizeMonth(
      [makeTransaction("2026-09-02T12:00", 2000, "food"), legacyIncome],
      "2026-09",
    );

    expect(summary.expenseCents).toBe(2000);
    expect(summary.transactionCount).toBe(1);
  });
});

describe("compareWithPreviousMonth", () => {
  it("正确计算总额和分类环比", () => {
    const comparison = compareWithPreviousMonth(
      [
        makeTransaction("2026-08-02T12:00", 1000, "food"),
        makeTransaction("2026-09-02T12:00", 1500, "food"),
        makeTransaction("2026-09-03T12:00", 500, "transport"),
      ],
      "2026-09",
    );

    expect(comparison.expenseDeltaCents).toBe(1000);
    expect(comparison.expenseChangeRate).toBe(1);
    expect(comparison.categoryChanges.find((item) => item.category === "food")?.changeRate).toBe(
      0.5,
    );
  });

  it("上月为零时不制造无穷大百分比", () => {
    const comparison = compareWithPreviousMonth(
      [makeTransaction("2026-09-02T12:00", 1500)],
      "2026-09",
    );
    expect(comparison.expenseChangeRate).toBeNull();
    expect(comparison.insights[0]).toContain("暂无支出数据");
  });

  it("跨年时返回正确上一个自然月", () => {
    expect(getPreviousMonthKey("2026-01")).toBe("2025-12");
  });
});
