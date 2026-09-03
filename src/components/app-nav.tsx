"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "总览", icon: "⌂" },
  { href: "/add", label: "记一笔", icon: "+" },
  { href: "/analysis", label: "分析", icon: "↗" },
] as const;

/**
 * 【做什么】提供移动端固定底部导航和桌面端顶部导航。
 * 【何时调用】根布局渲染所有业务页面时。
 */
export function AppNav() {
  const pathname = usePathname();

  return (
    <nav className="app-nav" aria-label="主要导航">
      <Link className="brand" href="/" aria-label="Tally 首页">
        <span className="brand-mark">T</span>
        <span>Tally</span>
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
