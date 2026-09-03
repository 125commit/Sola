# Sola 智能记账

本地优先的支出记账 PWA。支持手动记账、登录后电脑/手机同步、Qwen-VL 支付截图预填、月度支出总额、类别占比和上月环比分析。不记录收入。

## 本地启动

```powershell
npm install
npm run dev
```

打开 `http://localhost:3000`。账目先保存在当前浏览器的 IndexedDB 中。登录后会与 Postgres 对齐。

## 环境变量

复制 `.env.example` 为 `.env.local`。不要把真实密钥发到聊天或提交进 Git。

| 变量 | 作用 | 缺了会怎样 |
| --- | --- | --- |
| `DASHSCOPE_API_KEY` | 支付截图识别 | 只能手动记账 |
| `DATABASE_URL` | Neon / Vercel Postgres 连接串 | 不能登录同步 |
| `AUTH_SECRET` | 登录 Cookie 签名，至少 16 个字符 | 不能登录 |

Vercel 上这三项都要配到项目的 Environment Variables，改完后需要 Redeploy。

## 账号同步

点左上角 **Sola / 账号** 注册或登录。之后记一笔、改一笔、删一笔会自动同步到同一邮箱的其他设备。没有登录时行为与以前相同：账只在这台设备上。

## 截图识别

- 线上已启用登录时，需要先登录才能识别；未登录仍可手动记账。
- 相册里较大的截图会在浏览器里压缩后再上传，以避开 Vercel 4.5 MB 请求体限制。
- 原始截图只在识别请求期间传给阿里云百炼，不会写入本项目或 IndexedDB。本地只保存原图的 SHA-256 指纹，用来提示重复记账。

## 验证

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```
