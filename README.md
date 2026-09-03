# Tally 智能记账

本地优先的支出记账 PWA。支持手动记账、Qwen-VL 支付截图预填、月度支出总额、类别占比和上月环比分析。不记录收入。

## 本地启动

```powershell
npm install
npm run dev
```

打开网址。账目保存在当前浏览器的 IndexedDB 中。

## 开启截图识别

1. 复制 `.env.example` 为 `.env.local`。
2. 在自己的电脑上填写 `DASHSCOPE_API_KEY`，不要把真实 Key 发到聊天或提交进 Git。
3. 重启开发服务器。

没有 API Key 时，手动记账和所有统计功能仍可正常使用。

## 数据与隐私

- 原始截图仅在识别请求期间传给阿里云百炼，不会保存到本项目或 IndexedDB。
- 本地只保存截图的 SHA-256 指纹，用来提示重复记账。
- 删除浏览器站点数据会同时删除账本；初版尚未提供云同步，请自行注意浏览器数据清理。

## 验证

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```
