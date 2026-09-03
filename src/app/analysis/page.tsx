import type { Metadata } from "next";

import { AnalysisDashboard } from "@/components/analysis-dashboard";

export const metadata: Metadata = {
  title: "消费分析",
};

/**
 * 【做什么】承载月度类别占比和消费变化分析。
 * 【何时调用】用户从导航或首页进入分析页时。
 */
export default function AnalysisPage() {
  return <AnalysisDashboard />;
}
