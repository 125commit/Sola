"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatCents } from "@/lib/analytics";
import { getCategoryColor, getCategoryLabel } from "@/lib/categories";
import type { CategorySpending, MonthSummary } from "@/lib/types";

interface CategoryPieChartProps {
  data: CategorySpending[];
}

/**
 * 【做什么】展示所选月份各类别的支出占比。
 * 【何时调用】分析页已有至少一笔支出时。
 */
export function CategoryPieChart({ data }: CategoryPieChartProps) {
  const chartData = data.map((item) => ({
    ...item,
    name: getCategoryLabel(item.category),
  }));

  return (
    <div className="chart-layout">
      <div className="chart-box" aria-label="类别支出饼图">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              dataKey="amountCents"
              nameKey="name"
              innerRadius="58%"
              outerRadius="86%"
              paddingAngle={2}
              stroke="none"
            >
              {chartData.map((item) => (
                <Cell key={item.category} fill={getCategoryColor(item.category)} />
              ))}
            </Pie>
            <Tooltip formatter={(value) => formatCents(Number(value))} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="legend-list">
        {data.map((item) => (
          <div className="legend-row" key={item.category}>
            <span
              className="legend-swatch"
              style={{ backgroundColor: getCategoryColor(item.category) }}
            />
            <span>{getCategoryLabel(item.category)}</span>
            <strong>{(item.share * 100).toFixed(1)}%</strong>
            <small>{formatCents(item.amountCents)}</small>
          </div>
        ))}
      </div>
    </div>
  );
}

interface MonthlyTrendChartProps {
  data: MonthSummary[];
}

/**
 * 【做什么】展示连续六个月的消费金额变化。
 * 【何时调用】分析页加载本地流水后，空月份也保留为零。
 */
export function MonthlyTrendChart({ data }: MonthlyTrendChartProps) {
  const chartData = data.map((item) => ({
    month: `${Number(item.monthKey.slice(5))}月`,
    expenseCents: item.expenseCents,
  }));

  return (
    <div className="trend-chart" aria-label="近六个月支出趋势柱状图">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 8, right: 4, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#dcd8cc" />
          <XAxis dataKey="month" axisLine={false} tickLine={false} />
          <YAxis
            axisLine={false}
            tickLine={false}
            width={58}
            tickFormatter={(value) => `¥${Math.round(Number(value) / 100)}`}
          />
          <Tooltip formatter={(value) => formatCents(Number(value))} />
          <Bar dataKey="expenseCents" name="支出" fill="#183f33" radius={[8, 8, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
