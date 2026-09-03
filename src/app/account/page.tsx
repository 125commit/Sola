import type { Metadata } from "next";

import { AccountPanel } from "@/components/account-panel";

export const metadata: Metadata = {
  title: "账号",
};

/**
 * 【做什么】承载登录、注册和云同步状态。
 * 【何时调用】用户点击左上角 Sola 图标进入账号页时。
 */
export default function AccountPage() {
  return <AccountPanel />;
}
