# Tally 智能记账初版架构

## 目标

构建一个本地优先的可安装 Web 应用。账目保存在浏览器 IndexedDB；支付截图仅在用户主动识别时经服务端转发给 Qwen-VL，识别结果必须确认后才能写入账本。

## 数据流

1. 手动记账：表单校验 → 金额转为整数分 → 仅写入支出 → IndexedDB。
2. 截图记账：浏览器计算图片哈希 → `/api/receipts/parse` → Qwen-VL 提取全部支出 → Schema 校验 → 多条表单预填 → 用户逐条核对或移除 → 一次写入 IndexedDB。
3. 消费分析：IndexedDB 支出流水 → 月份边界过滤 → 总额、分类占比和环比变化。

## 模块清单

- `src/lib/db.ts`：账目持久化唯一入口。
- `src/lib/analytics.ts`：月度统计与环比分析的纯函数。
- `src/lib/receipt-schema.ts`：识别结果协议、校验与规范化。
- `src/app/api/receipts/parse/route.ts`：Qwen-VL 服务端适配器；API Key 不进入浏览器。
- `src/app/add/page.tsx`：手动输入和截图预填共用的确认表单。
- `src/app/page.tsx`：本月概览与流水管理。
- `src/app/analysis/page.tsx`：分类占比、月度趋势与行为变化。

## 约束

- 金额持久化为整数分，禁止使用浮点金额作为账本真值。
- 原始截图不持久化、不写日志；只保存不可逆 SHA-256 哈希用于重复提醒。
- 没有 API Key、网络错误或低置信度时必须保留手动记账能力。
- 产品只记录支出；不提供收入录入、收入汇总或结余计算。
- 截图识别只生成支出候选；收入、收款、退款和无法确认金额的项目不得进入待确认列表。
- 统计与界面只处理 `type === "expense"` 的流水。
- 初版为单用户、本地数据，不包含登录与云同步。
