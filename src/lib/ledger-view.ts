import type { Transaction } from "@/lib/types";

/** 刚确认入账的笔数，供首页立刻提示；sessionStorage 键名。 */
export const JUST_SAVED_STORAGE_KEY = "sola-just-saved";

function isActive(transaction: Transaction): boolean {
  return !transaction.deletedAt;
}

/**
 * 【做什么】筛出界面该展示的支出，并按入账时间倒序。
 * 【何时调用】从 IndexedDB 取出全表后，或单测验证排序时。
 * 【原因】截图里的交易日经常是上月；若按 occurredAt 排，「最近支出」会把刚确认的账沉到底部，看起来像没记上。
 */
export function toVisibleLedger(rows: Transaction[]): Transaction[] {
  return rows
    .filter((item) => isActive(item) && item.type === "expense")
    .sort((left, right) => {
      const created = (right.createdAt ?? "").localeCompare(left.createdAt ?? "");
      if (created !== 0) {
        return created;
      }
      return (right.updatedAt ?? "").localeCompare(left.updatedAt ?? "");
    });
}
