"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";

import {
  compareWithPreviousMonth,
  formatCents,
  getMonthKey,
  getRecentMonthSummaries,
} from "@/lib/analytics";
import { getCategoryLabel } from "@/lib/categories";
import { db } from "@/lib/db";
import { CategoryPieChart, MonthlyTrendChart } from "@/components/expense-charts";

/**
 * 【做什么】把 YYYY-MM 转成中文月份标题。
 * 【何时调用】分析页展示当前选择和上月对比标签时。
 */
function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-");
  return `${year} 年 ${Number(month)} 月`;
}

/**
 * 【做什么】把环比小数转成带方向的百分比。
 * 【何时调用】存在有效上月基数时；无基数显示“暂无可比数据”。
 */
function formatChangeRate(rate: number | null): string {
  if (rate === null) {
    return "暂无可比数据";
  }
  return `${rate >= 0 ? "+" : "−"}${Math.abs(rate * 100).toFixed(1)}%`;
}

/**
 * 【做什么】展示类别结构、近月趋势和相对上月的行为变化。
 * 【何时调用】用户打开消费分析页或切换目标月份时。
 */
export function AnalysisDashboard() {
  const transactions = useLiveQuery(() => db.transactions.toArray(), []);
  const [selectedMonth, setSelectedMonth] = useState(getMonthKey());
  const comparison = useMemo(
    () => compareWithPreviousMonth(transactions ?? [], selectedMonth),
    [selectedMonth, transactions],
  );
  const trendAnchor = useMemo(() => {
    const [year, month] = selectedMonth.split("-").map(Number);
    return new Date(year, month - 1, 1);
  }, [selectedMonth]);
  const trend = useMemo(
    () => getRecentMonthSummaries(transactions ?? [], 6, trendAnchor),
    [transactions, trendAnchor],
  );

  if (!transactions) {
    return <main className="page-shell loading-state">正在分析本地账本…</main>;
  }

  return (
    <main className="page-shell analysis-page">
      <header className="hero-header">
        <div>
          <p className="eyebrow">消费习惯</p>
          <h1>让变化变得看得见</h1>
          <p className="hero-copy">用类别结构和月度对比找到最值得控制的开销。</p>
        </div>
        <label className="month-picker">
          <span>分析月份</span>
          <input
            type="month"
            value={selectedMonth}
            onChange={(event) => setSelectedMonth(event.target.value || getMonthKey())}
          />
        </label>
      </header>

      <section className="comparison-banner">
        <div>
          <p>{formatMonthLabel(selectedMonth)}总支出</p>
          <strong>{formatCents(comparison.current.expenseCents)}</strong>
        </div>
        <div className="comparison-divider" aria-hidden="true" />
        <div>
          <p>相比上月</p>
          <strong className={comparison.expenseDeltaCents > 0 ? "negative" : "positive"}>
            {formatChangeRate(comparison.expenseChangeRate)}
          </strong>
          <small>
            {comparison.expenseChangeRate === null
              ? "需要上月记录才能计算"
              : `${comparison.expenseDeltaCents >= 0 ? "多花" : "少花"} ${formatCents(
                  Math.abs(comparison.expenseDeltaCents),
                )}`}
          </small>
        </div>
      </section>

      <section className="analysis-grid">
        <article className="content-card category-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">支出去向</p>
              <h2>类别占比</h2>
            </div>
          </div>
          {comparison.current.categorySpending.length > 0 ? (
            <CategoryPieChart data={comparison.current.categorySpending} />
          ) : (
            <div className="empty-state compact-empty">
              <h3>这个月还没有支出</h3>
              <p>记下第一笔后，这里会显示类别占比。</p>
            </div>
          )}
        </article>

        <article className="content-card insight-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">行为提示</p>
              <h2>本月值得注意</h2>
            </div>
          </div>
          <div className="insight-list">
            {comparison.insights.map((insight, index) => (
              <div className="insight-item" key={insight}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <p>{insight}</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="content-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">长期趋势</p>
            <h2>近六个月支出</h2>
          </div>
        </div>
        <MonthlyTrendChart data={trend} />
      </section>

      <section className="content-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">分类环比</p>
            <h2>哪里花多了，哪里控制住了</h2>
          </div>
        </div>
        {comparison.categoryChanges.length === 0 ? (
          <p className="muted">当前月和上月都没有可比较的支出类别。</p>
        ) : (
          <div className="change-list">
            {comparison.categoryChanges.map((item) => (
              <div className="change-row" key={item.category}>
                <div>
                  <strong>{getCategoryLabel(item.category)}</strong>
                  <span>
                    上月 {formatCents(item.previousCents)} → 本月 {formatCents(item.currentCents)}
                  </span>
                </div>
                <strong className={item.deltaCents > 0 ? "negative" : "positive"}>
                  {item.changeRate === null
                    ? `新增 ${formatCents(item.currentCents)}`
                    : formatChangeRate(item.changeRate)}
                </strong>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
