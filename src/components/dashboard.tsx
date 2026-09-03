"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useState } from "react";

import { formatCents, getMonthKey, summarizeMonth } from "@/lib/analytics";
import { getCategoryLabel } from "@/lib/categories";
import { deleteTransaction, queryActiveTransactions } from "@/lib/db";
import { JUST_SAVED_STORAGE_KEY } from "@/lib/ledger-view";
import type { Transaction } from "@/lib/types";
import { useAuth } from "@/components/auth-provider";
import { TransactionForm } from "@/components/transaction-form";

/** 日期展示器保留月日和时间，减少流水列表的视觉噪音。 */
const DATE_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * 【做什么】读取刚刚确认入账的笔数，给首页一条即时提示。
 * 【何时调用】Dashboard 首次渲染时作为 state 初始值。
 */
function readJustSavedCount(): number | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = sessionStorage.getItem(JUST_SAVED_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as { count?: number; at?: number };
    if (typeof parsed.count === "number" && parsed.count > 0 && Date.now() - (parsed.at ?? 0) < 60_000) {
      return parsed.count;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * 【做什么】展示当前月支出总览、月度进度和最近支出管理。
 * 【何时调用】用户进入应用首页时。
 */
export function Dashboard() {
  const { ready, user } = useAuth();
  const transactions = useLiveQuery(() => queryActiveTransactions(), []);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [justSavedCount] = useState<number | null>(readJustSavedCount);
  const now = new Date();
  const monthKey = getMonthKey(now);
  // NOTE: 汇总是轻量纯计算，直接执行可避免可变 IndexedDB 数组破坏手工 memo 语义。
  const summary = summarizeMonth(transactions ?? [], monthKey);
  // CHANGED: 查询层已按入账时间倒序并去掉墓碑；这里不再按交易日过滤，避免刚记入的上月截图账单「消失」。
  const expenseList = transactions ?? [];
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const monthProgress = Math.min(100, (now.getDate() / daysInMonth) * 100);
  const dailyAverage =
    now.getDate() === 0 ? 0 : Math.round(summary.expenseCents / now.getDate());

  /**
   * 【做什么】经用户二次确认后删除支出。
   * 【何时调用】首页流水条目点击删除时。
   */
  async function handleDelete(transaction: Transaction) {
    if (transaction.id === undefined) {
      return;
    }

    // WARN: 删除会立即改变统计且不可撤销，因此必须先显示账目摘要确认。
    const confirmed = window.confirm(
      `确认删除 ${transaction.merchant || getCategoryLabel(transaction.category)} ${formatCents(
        transaction.amountCents,
      )}？`,
    );
    if (confirmed) {
      await deleteTransaction(transaction.id);
    }
  }

  if (!transactions) {
    return <main className="page-shell loading-state">正在读取本地账本…</main>;
  }

  return (
    <main className="page-shell dashboard-page">
      <header className="hero-header">
        <div>
          <p className="eyebrow">{monthKey.replace("-", " 年 ")} 月</p>
          <h1>看清钱花去了哪里</h1>
          <p className="hero-copy">只记录支出，持续记账才能看见习惯变化。</p>
        </div>
        <Link className="primary-button compact" href="/add">
          + 记一笔
        </Link>
      </header>

      {justSavedCount !== null && (
        <p className="notice success-notice">
          已记入 {justSavedCount} 笔支出，按入账时间排在最上面。若截图是上月账单，本月总额不会变。
        </p>
      )}

      {/* CHANGED: 未登录时明确提示数据还在本机，避免用户以为换手机会自动带上账本。 */}
      {ready && !user && (
        <p className="notice sync-notice">
          当前账本只存在这台设备。
          <Link className="text-link" href="/account">
            登录账号后可在电脑和手机同步
          </Link>
        </p>
      )}

      <section className="summary-grid expense-only-grid" aria-label="本月支出摘要">
        <article className="summary-card featured">
          <p>本月总支出</p>
          <strong>{formatCents(summary.expenseCents)}</strong>
          <div className="progress-track" aria-label={`本月已过去 ${monthProgress.toFixed(0)}%`}>
            <span style={{ width: `${monthProgress}%` }} />
          </div>
          <small>
            本月已过 {now.getDate()} / {daysInMonth} 天
          </small>
        </article>
        <article className="summary-card">
          <p>支出笔数</p>
          <strong>{summary.transactionCount}</strong>
          <small>本月已记支出</small>
        </article>
        <article className="summary-card">
          <p>日均支出</p>
          <strong>{formatCents(dailyAverage)}</strong>
          <small>按本月已过天数估算</small>
        </article>
      </section>

      <section className="content-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">最近支出</p>
            <h2>每一笔都有迹可循</h2>
          </div>
          <Link className="text-link" href="/analysis">
            查看消费分析 →
          </Link>
        </div>

        {expenseList.length === 0 ? (
          <div className="empty-state">
            <span>¥</span>
            <h3>还没有支出</h3>
            <p>手动输入，或上传支付截图自动填写第一笔。</p>
            <Link className="secondary-button" href="/add">
              开始记账
            </Link>
          </div>
        ) : (
          <div className="transaction-list">
            {expenseList.slice(0, 12).map((transaction) => (
              <article className="transaction-row" key={transaction.id}>
                <div className={`category-dot category-${transaction.category}`} aria-hidden="true">
                  {getCategoryLabel(transaction.category).slice(0, 1)}
                </div>
                <div className="transaction-main">
                  <strong>{transaction.merchant || getCategoryLabel(transaction.category)}</strong>
                  <span>
                    {getCategoryLabel(transaction.category)} ·{" "}
                    {DATE_FORMATTER.format(new Date(transaction.occurredAt))}
                    {transaction.source === "screenshot" ? " · 截图" : ""}
                  </span>
                </div>
                <strong className="transaction-amount">
                  −{formatCents(transaction.amountCents)}
                </strong>
                <div className="row-actions">
                  <button type="button" onClick={() => setEditing(transaction)}>
                    编辑
                  </button>
                  <button type="button" onClick={() => handleDelete(transaction)}>
                    删除
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {editing && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="编辑支出">
          <div className="modal-panel">
            <button className="modal-close" type="button" onClick={() => setEditing(null)}>
              关闭
            </button>
            <TransactionForm
              key={editing.id}
              initial={editing}
              onSaved={() => setEditing(null)}
            />
          </div>
        </div>
      )}
    </main>
  );
}
