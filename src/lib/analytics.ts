import { getCategoryLabel } from "@/lib/categories";
import type { MonthComparison, MonthSummary, Transaction } from "@/lib/types";

/** 人民币格式化器只创建一次，避免图表批量渲染时重复分配对象。 */
const CURRENCY_FORMATTER = new Intl.NumberFormat("zh-CN", {
  style: "currency",
  currency: "CNY",
  minimumFractionDigits: 2,
});

/**
 * 【做什么】把用户输入的元转换成可安全持久化的整数分。
 * 【何时调用】手动或截图预填表单提交前。
 */
export function yuanToCents(value: string | number): number | null {
  const normalized = typeof value === "number" ? String(value) : value.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    return null;
  }

  const cents = Math.round(Number(normalized) * 100);
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

/**
 * 【做什么】把整数分转换成人民币展示文本。
 * 【何时调用】总览、流水和分析结果展示金额时。
 */
export function formatCents(cents: number): string {
  return CURRENCY_FORMATTER.format(cents / 100);
}

/**
 * 【做什么】按用户本地时区生成 YYYY-MM 月份键。
 * 【何时调用】决定仪表盘当前月或构造历史月份时。
 */
export function getMonthKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * 【做什么】返回指定月份的上一个自然月。
 * 【何时调用】计算环比时，正确处理跨年边界。
 */
export function getPreviousMonthKey(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  return getMonthKey(new Date(year, month - 2, 1));
}

/**
 * 【做什么】汇总某个自然月的支出总额和类别结构。
 * 【何时调用】首页月度总览、类别图和环比分析需要统一口径时。
 */
export function summarizeMonth(transactions: Transaction[], monthKey: string): MonthSummary {
  // NOTE: 仅统计支出；本地若残留旧版收入记录，不会进入总额或占比。
  const expenseItems = transactions.filter(
    (item) => item.type === "expense" && item.occurredAt.startsWith(monthKey),
  );
  const expenseCents = expenseItems.reduce((sum, item) => sum + item.amountCents, 0);
  const categoryTotals = new Map<string, number>();

  for (const item of expenseItems) {
    categoryTotals.set(item.category, (categoryTotals.get(item.category) ?? 0) + item.amountCents);
  }

  const categorySpending = [...categoryTotals.entries()]
    .map(([category, amountCents]) => ({
      category,
      amountCents,
      share: expenseCents === 0 ? 0 : amountCents / expenseCents,
    }))
    .sort((left, right) => right.amountCents - left.amountCents);

  return {
    monthKey,
    expenseCents,
    transactionCount: expenseItems.length,
    categorySpending,
  };
}

/**
 * 【做什么】计算当前月相对上月的总额与分类变化，并生成克制的文字提示。
 * 【何时调用】消费分析页选择目标月份后。
 */
export function compareWithPreviousMonth(
  transactions: Transaction[],
  monthKey: string,
): MonthComparison {
  const current = summarizeMonth(transactions, monthKey);
  const previous = summarizeMonth(transactions, getPreviousMonthKey(monthKey));
  const categories = new Set([
    ...current.categorySpending.map((item) => item.category),
    ...previous.categorySpending.map((item) => item.category),
  ]);

  const categoryChanges = [...categories]
    .map((category) => {
      const currentCents =
        current.categorySpending.find((item) => item.category === category)?.amountCents ?? 0;
      const previousCents =
        previous.categorySpending.find((item) => item.category === category)?.amountCents ?? 0;
      return {
        category,
        currentCents,
        previousCents,
        deltaCents: currentCents - previousCents,
        changeRate: previousCents === 0 ? null : (currentCents - previousCents) / previousCents,
      };
    })
    .sort((left, right) => Math.abs(right.deltaCents) - Math.abs(left.deltaCents));

  const expenseDeltaCents = current.expenseCents - previous.expenseCents;
  const expenseChangeRate =
    previous.expenseCents === 0 ? null : expenseDeltaCents / previous.expenseCents;
  const insights = buildInsights(current, previous, categoryChanges, expenseChangeRate);

  return {
    current,
    previous,
    expenseDeltaCents,
    expenseChangeRate,
    categoryChanges,
    insights,
  };
}

/**
 * 【做什么】生成最近若干自然月的汇总，空月份也保留。
 * 【何时调用】趋势图需要连续横轴时。
 */
export function getRecentMonthSummaries(
  transactions: Transaction[],
  count = 6,
  anchorDate = new Date(),
): MonthSummary[] {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(anchorDate.getFullYear(), anchorDate.getMonth() - (count - index - 1), 1);
    return summarizeMonth(transactions, getMonthKey(date));
  });
}

/**
 * 【做什么】把统计结果转成不会夸大样本的消费提示。
 * 【何时调用】环比数据计算完成后；最多输出三条重点变化。
 */
function buildInsights(
  current: MonthSummary,
  previous: MonthSummary,
  categoryChanges: MonthComparison["categoryChanges"],
  expenseChangeRate: number | null,
): string[] {
  if (current.expenseCents === 0) {
    return ["本月还没有支出记录，记下第一笔后才能分析消费习惯。"];
  }

  const insights: string[] = [];

  // NOTE: 没有上月样本时只陈述本月结构，不伪造环比结论。
  if (previous.expenseCents === 0) {
    insights.push("上月暂无支出数据，本月将作为后续比较基准。");
  } else if (expenseChangeRate !== null) {
    const direction = expenseChangeRate >= 0 ? "增加" : "减少";
    insights.push(`本月总支出较上月${direction} ${Math.abs(expenseChangeRate * 100).toFixed(1)}%。`);
  }

  const largestChange = categoryChanges.find((item) => item.deltaCents !== 0);
  if (largestChange && previous.expenseCents > 0) {
    const direction = largestChange.deltaCents > 0 ? "增加" : "减少";
    insights.push(
      `${getCategoryLabel(largestChange.category)}支出变化最大，较上月${direction} ${formatCents(
        Math.abs(largestChange.deltaCents),
      )}。`,
    );
  }

  const dominant = current.categorySpending[0];
  if (dominant && dominant.share >= 0.35) {
    insights.push(
      `${getCategoryLabel(dominant.category)}占本月支出的 ${(dominant.share * 100).toFixed(
        1,
      )}%，是当前最集中的消费方向。`,
    );
  }

  return insights.slice(0, 3);
}
