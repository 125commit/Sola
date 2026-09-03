import type { Metadata } from "next";

import { TransactionForm } from "@/components/transaction-form";

export const metadata: Metadata = {
  title: "记一笔",
};

/**
 * 【做什么】提供截图识别与手动输入共用的新增账目页面。
 * 【何时调用】用户从导航或首页点击“记一笔”时。
 */
export default function AddTransactionPage() {
  return (
    <main className="page-shell add-page">
      <header className="simple-header">
        <p className="eyebrow">快速记账</p>
        <h1>花几秒，记清这一笔</h1>
        <p className="hero-copy">截图可以帮你填，最终内容由你确认。</p>
      </header>
      <TransactionForm />
    </main>
  );
}
