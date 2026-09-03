"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useAuth } from "@/components/auth-provider";

const NAV_ITEMS = [
  { href: "/", label: "总览", icon: "⌂" },
  { href: "/add", label: "记一笔", icon: "+" },
  { href: "/analysis", label: "分析", icon: "↗" },
] as const;

/**
 * 【做什么】提供桌面顶部导航、移动端底栏，以及点品牌图标进入账号。
 * 【何时调用】根布局渲染所有业务页面时。
 */
export function AppNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const onAccount = pathname.startsWith("/account");

  return (
    <nav className="app-nav" aria-label="主要导航">
      {/* CHANGED: 品牌不再回首页 → 进入账号页。底部「我的」不容易被发现，手机上图标还被隐藏。 */}
      <Link
        className={`brand ${onAccount ? "is-active" : ""}`}
        href="/account"
        aria-label={user ? `账号 ${user.email}，点击管理或退出` : "登录或注册账号"}
        aria-current={onAccount ? "page" : undefined}
      >
        <span className={`brand-mark ${user ? "is-signed-in" : ""}`}>S</span>
        <span className="brand-name">Sola</span>
        <span className="brand-account-label">账号</span>
      </Link>
      <div className="nav-links">
        {NAV_ITEMS.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              className={`nav-link ${active ? "is-active" : ""}`}
              href={item.href}
              key={item.href}
              aria-current={active ? "page" : undefined}
            >
              <span className="nav-icon" aria-hidden="true">
                {item.icon}
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
