export type TransactionType = "expense";
export type TransactionSource = "manual" | "screenshot";

/**
 * 【做什么】描述一笔已经由用户确认的支出。
 * 【何时使用】写入 IndexedDB、渲染流水或参与月度统计时。
 */
export interface Transaction {
  id?: number;
  type: TransactionType;
  amountCents: number;
  category: string;
  merchant: string;
  occurredAt: string;
  note: string;
  source: TransactionSource;
  imageHash?: string;
  createdAt: string;
  updatedAt: string;
}

/** 用户表单提交前的数据形态，时间采用本地 datetime-local 字符串。 */
export type TransactionDraft = Omit<Transaction, "id" | "createdAt" | "updatedAt">;

/** 单个类别在某月的支出和占比。 */
export interface CategorySpending {
  category: string;
  amountCents: number;
  share: number;
}

/** 某个月的支出汇总；产品仅记账支出，不包含收入或结余。 */
export interface MonthSummary {
  monthKey: string;
  expenseCents: number;
  transactionCount: number;
  categorySpending: CategorySpending[];
}

/** 当前月相对上月的消费变化；百分比无法计算时使用 null。 */
export interface MonthComparison {
  current: MonthSummary;
  previous: MonthSummary;
  expenseDeltaCents: number;
  expenseChangeRate: number | null;
  categoryChanges: Array<{
    category: string;
    currentCents: number;
    previousCents: number;
    deltaCents: number;
    changeRate: number | null;
  }>;
  insights: string[];
}
