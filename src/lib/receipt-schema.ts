import { z } from "zod";

/** 识别接口只接受账本已经登记的支出类别，避免模型随意创造分类。 */
const ReceiptCategorySchema = z.enum([
  "food",
  "transport",
  "shopping",
  "housing",
  "entertainment",
  "medical",
  "education",
  "social",
  "transfer",
  "other",
]);

/**
 * 【做什么】约束截图中一条可确认支出的字段。
 * 【何时使用】服务端和客户端校验批量识别结果中的每个候选项时。
 */
export const ParsedExpenseSchema = z
  .object({
    source: z.enum(["wechat_pay", "alipay", "bank", "receipt", "unknown"]),
    direction: z.literal("expense"),
    amount_yuan: z.number().positive().max(1_000_000),
    occurred_at: z.string().min(8).max(32).nullable(),
    merchant: z.string().max(120).nullable(),
    payment_method: z.string().max(80).nullable(),
    category_guess: ReceiptCategorySchema.nullable(),
    confidence: z.number().min(0).max(1),
    notes: z.string().max(240).nullable(),
  })
  .strict();

export type ParsedExpense = z.infer<typeof ParsedExpenseSchema>;

/**
 * 【做什么】约束一张截图提取出的全部支出和被忽略项目数。
 * 【何时使用】模型输出解析与客户端 API 响应校验时。
 */
export const ParsedReceiptBatchSchema = z
  .object({
    expenses: z.array(ParsedExpenseSchema).max(50),
    ignored_count: z.number().int().min(0).max(100),
  })
  .strict();

export type ParsedReceiptBatch = z.infer<typeof ParsedReceiptBatchSchema>;

/** 模型提示词使用的批量输出示例，与运行时 Zod 校验保持一致。 */
export const RECEIPT_BATCH_OUTPUT_EXAMPLE: ParsedReceiptBatch = {
  expenses: [
    {
      source: "wechat_pay",
      direction: "expense",
      amount_yuan: 12.8,
      occurred_at: "2026-09-02 18:30:00",
      merchant: "示例商户",
      payment_method: "零钱",
      category_guess: "food",
      confidence: 0.92,
      notes: null,
    },
  ],
  ignored_count: 0,
};

/**
 * 【做什么】从模型文本中提取并验证批量支出 JSON。
 * 【何时调用】视觉接口响应成功后；兼容模型偶尔附带 Markdown 围栏的情况。
 */
export function parseReceiptBatchModelOutput(content: string): ParsedReceiptBatch {
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = trimmed.indexOf("{");
  const finish = trimmed.lastIndexOf("}");

  // WARN: 没有完整对象时拒绝猜测，让前端安全回退到手填。
  if (start < 0 || finish <= start) {
    throw new Error("识别服务没有返回有效 JSON");
  }

  let candidate: unknown;
  try {
    candidate = JSON.parse(trimmed.slice(start, finish + 1));
  } catch {
    throw new Error("识别服务返回的 JSON 无法解析");
  }

  const result = ParsedReceiptBatchSchema.safeParse(candidate);
  if (!result.success) {
    throw new Error("识别结果字段不完整，请手动填写");
  }
  return result.data;
}

/**
 * 【做什么】把模型时间转换为 datetime-local 可接受的分钟格式。
 * 【何时调用】识别结果写入表单之前；无法可靠解析时返回 null。
 */
export function normalizeReceiptDateTime(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().replace(" ", "T").replace(/\//g, "-");
  const match = normalized.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  return match ? `${match[1]}T${match[2]}` : null;
}
