/**
 * 【做什么】集中定义可选消费类别及图表颜色。
 * 【何时使用】表单、识别协议和分析图表需要保持同一套分类时。
 */
export const CATEGORIES = [
  { id: "food", label: "餐饮", color: "#E07A5F" },
  { id: "transport", label: "交通", color: "#4E79A7" },
  { id: "shopping", label: "购物", color: "#F2CC8F" },
  { id: "housing", label: "居住", color: "#59A14F" },
  { id: "entertainment", label: "娱乐", color: "#AF7AA1" },
  { id: "medical", label: "医疗", color: "#E15759" },
  { id: "education", label: "教育", color: "#76B7B2" },
  { id: "social", label: "人情", color: "#FF9DA7" },
  { id: "transfer", label: "转账", color: "#9C755F" },
  { id: "other", label: "其他", color: "#BAB0AC" },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];

/**
 * 【做什么】把内部分类 ID 转成人类可读名称。
 * 【何时使用】流水和分析图表展示分类时。
 */
export function getCategoryLabel(category: string): string {
  return CATEGORIES.find((item) => item.id === category)?.label ?? "其他";
}

/**
 * 【做什么】为类别返回稳定颜色，未知类别使用中性色。
 * 【何时使用】类别占比图和图例渲染时。
 */
export function getCategoryColor(category: string): string {
  return CATEGORIES.find((item) => item.id === category)?.color ?? "#BAB0AC";
}
