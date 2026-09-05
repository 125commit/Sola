# Sola 智能记账初版架构

## 目标

构建一个本地优先、可安装的记账 Web 应用。账目先写入浏览器 IndexedDB；登录后与 Postgres 对齐，从而在电脑和手机之间同步。支付截图仅在用户主动识别时经服务端转发给 Qwen-VL，识别结果必须确认后才能写入账本。

## 数据流

1. 手动记账：表单校验 → 金额转为整数分 → 仅写入支出 → IndexedDB；已登录则后台推送到云端。
2. 截图记账：浏览器对原图计算哈希 → 压缩到 3.5 MB 以内 → `/api/receipts/parse`（线上已启用登录时需会话）→ Qwen-VL 提取全部支出 → Schema 校验 → 多条表单预填 → 用户逐条核对或移除 → 一次写入 IndexedDB。选图热区必须是**直接可点的** `input[type=file]`（不用 label 转发）；`accept` 同时写 MIME 与扩展名。Service Worker 不缓存 HTML 导航响应。
3. 消费分析：IndexedDB 支出流水 → 月份边界过滤 → 总额、分类占比和环比变化。首页「最近支出」按 `createdAt` 倒序，刚确认的截图账单会立刻出现在列表顶部；本月总额仍按交易发生日统计。
4. 账号同步：注册/登录签发 HttpOnly Cookie → `POST /api/sync` 以 `syncId` 做最后写入获胜合并 → 其他设备拉取同一本账。

## 模块清单

- `src/lib/db.ts`：账目持久化唯一入口；IndexedDB 仍是界面读取来源。
- `src/lib/ledger-view.ts`：未删除支出的筛选与按入账时间排序。
- `src/lib/auth.ts`：会话 Cookie 与密码哈希。
- `src/lib/cloud-db.ts`：Neon/Vercel Postgres 用户表和云端账目。
- `src/lib/sync-merge.ts`：按 `syncId` 与 `updatedAt` 合并两端账本。
- `src/lib/analytics.ts`：月度统计与环比分析的纯函数。
- `src/lib/receipt-schema.ts`：识别结果协议、校验与规范化。
- `src/lib/image.ts`：截图格式校验、原图哈希、浏览器端压缩（上传体积必须低于 Vercel 4.5 MB 限制）。
- `src/app/api/receipts/parse/route.ts`：Qwen-VL 服务端适配器；API Key 不进入浏览器。已配置云登录时必须带会话。
- `src/app/api/auth/*/route.ts`：注册、登录、退出与当前会话。
- `src/app/api/sync/route.ts`：已登录用户的账本上传与下载。
- `src/app/add/page.tsx`：手动输入和截图预填共用的确认表单。
- `src/app/page.tsx`：本月概览与流水管理。
- `src/app/analysis/page.tsx`：分类占比、月度趋势与行为变化。
- `src/app/account/page.tsx`：登录注册与同步状态。
- `src/app/manifest.ts` 与 `public/sw.js`：可安装 PWA 外壳。

## 约束

- 金额持久化为整数分，禁止使用浮点金额作为账本真值。
- 原始截图不持久化、不写日志；只保存不可逆 SHA-256 哈希用于重复提醒。哈希按用户选出的原图计算，不按压缩后的 JPEG。
- 发给 `/api/receipts/parse` 的文件必须 ≤ 3.5 MB；客户端负责压缩。没有 API Key、网络错误或低置信度时必须保留手动记账能力。
- 已配置 DATABASE_URL / AUTH_SECRET 时，截图识别必须登录；没有这两项时必须保留未登录的本地记账（含本机识别，若有 Key）。
- 产品只记录支出；不提供收入录入、收入汇总或结余计算。
- 截图识别只生成支出候选；收入、收款、退款和无法确认金额的项目不得进入待确认列表。
- 统计与界面只处理 `type === "expense"` 且未删除的流水。
- 跨设备对齐使用 `syncId`；删除写入 `deletedAt` 墓碑，避免另一台设备无法删除。
- 换账号登录前清空本机账本，避免把上一个邮箱的支出上传到新账号。
