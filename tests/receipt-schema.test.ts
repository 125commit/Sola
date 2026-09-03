import { describe, expect, it } from "vitest";

import {
  normalizeReceiptDateTime,
  parseReceiptBatchModelOutput,
  RECEIPT_BATCH_OUTPUT_EXAMPLE,
} from "@/lib/receipt-schema";

describe("parseReceiptBatchModelOutput", () => {
  it("接受包含多笔支出的 JSON 和偶发 Markdown 围栏", () => {
    const batch = {
      expenses: [
        RECEIPT_BATCH_OUTPUT_EXAMPLE.expenses[0],
        {
          ...RECEIPT_BATCH_OUTPUT_EXAMPLE.expenses[0],
          amount_yuan: 35,
          merchant: "第二家商户",
        },
      ],
      ignored_count: 2,
    };
    const parsed = parseReceiptBatchModelOutput(
      `\`\`\`json\n${JSON.stringify(batch)}\n\`\`\``,
    );
    expect(parsed.expenses).toHaveLength(2);
    expect(parsed.expenses[1].amount_yuan).toBe(35);
    expect(parsed.ignored_count).toBe(2);
  });

  it("拒绝模型创造的未知类别", () => {
    expect(() =>
      parseReceiptBatchModelOutput(
        JSON.stringify({
          expenses: [
            {
              ...RECEIPT_BATCH_OUTPUT_EXAMPLE.expenses[0],
              category_guess: "coffee",
            },
          ],
          ignored_count: 0,
        }),
      ),
    ).toThrow("字段不完整");
  });

  it("拒绝把收入混入待确认支出", () => {
    expect(() =>
      parseReceiptBatchModelOutput(
        JSON.stringify({
          expenses: [
            {
              ...RECEIPT_BATCH_OUTPUT_EXAMPLE.expenses[0],
              direction: "income",
            },
          ],
          ignored_count: 0,
        }),
      ),
    ).toThrow("字段不完整");
  });

  it("允许没有可靠支出时返回空数组", () => {
    const parsed = parseReceiptBatchModelOutput('{"expenses":[],"ignored_count":3}');
    expect(parsed.expenses).toEqual([]);
    expect(parsed.ignored_count).toBe(3);
  });

  it("拒绝缺少关键字段的对象", () => {
    expect(() => parseReceiptBatchModelOutput('{"expenses":[]}')).toThrow("字段不完整");
  });
});

describe("normalizeReceiptDateTime", () => {
  it("把常见支付时间转换成表单格式", () => {
    expect(normalizeReceiptDateTime("2026-09-02 18:30:15")).toBe("2026-09-02T18:30");
    expect(normalizeReceiptDateTime("2026/09/02 18:30")).toBe("2026-09-02T18:30");
  });

  it("不猜测无法识别的日期", () => {
    expect(normalizeReceiptDateTime("9月2日下午")).toBeNull();
    expect(normalizeReceiptDateTime(null)).toBeNull();
  });
});
