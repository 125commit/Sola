"use client";

import { FormEvent, useState } from "react";

import { useAuth } from "@/components/auth-provider";
import { PwaInstallCard } from "@/components/pwa-install";

/**
 * 【做什么】提供注册、登录、退出、手动同步，以及安装到主屏幕。
 * 【何时调用】用户点击品牌图标打开账号页时。
 */
export function AccountPanel() {
  const { ready, cloudReady, user, syncStatus, lastSyncedAt, error, login, register, logout, syncNow } =
    useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  /**
   * 【做什么】把表单提交到注册或登录接口，成功后会立刻同步本机账本。
   * 【何时调用】账号页点击登录/注册时。
   */
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setPending(true);
    try {
      if (mode === "register") {
        await register(email, password);
      } else {
        await login(email, password);
      }
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : "操作失败，请重试");
    } finally {
      setPending(false);
    }
  }

  if (!ready) {
    return <main className="page-shell loading-state">正在读取账号状态…</main>;
  }

  const syncLabel = {
    idle: "尚未同步",
    syncing: "正在同步…",
    synced: lastSyncedAt
      ? `已同步 · ${new Date(lastSyncedAt).toLocaleString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`
      : "已同步",
    error: error ?? "同步失败",
    offline: "离线，连网后会自动同步",
  }[syncStatus];

  return (
    <main className="page-shell account-page">
      <header className="simple-header">
        <p className="eyebrow">账号与同步</p>
        <h1>{user ? "账本已绑定账号" : "登录后，电脑和手机共用一本账"}</h1>
        <p className="hero-copy">
          未登录时仍然只保存在这台设备。登录后会把本机支出上传，并在其他设备下载同一本账。
        </p>
      </header>

      {!cloudReady && (
        <p className="notice error-notice">
          云同步尚未配置。请在 Vercel 环境变量中填写 DATABASE_URL（Neon/Vercel Postgres）和 AUTH_SECRET。
        </p>
      )}

      <PwaInstallCard />

      {user ? (
        <section className="content-card account-card">
          <p className="eyebrow">当前账号</p>
          <h2>{user.email}</h2>
          <p className={`sync-status is-${syncStatus}`}>{syncLabel}</p>
          <div className="account-actions">
            <button className="primary-button" type="button" onClick={() => void syncNow()} disabled={syncStatus === "syncing"}>
              {syncStatus === "syncing" ? "同步中…" : "立即同步"}
            </button>
            <button className="secondary-button" type="button" onClick={() => void logout()}>
              退出登录
            </button>
          </div>
          <p className="muted">退出后本机账本仍在；换一个邮箱登录前请确认当前账已同步完成。</p>
        </section>
      ) : (
        <section className="content-card account-card">
          <div className="auth-tabs" role="tablist" aria-label="登录或注册">
            <button
              className={mode === "login" ? "is-active" : ""}
              type="button"
              role="tab"
              aria-selected={mode === "login"}
              onClick={() => setMode("login")}
            >
              登录
            </button>
            <button
              className={mode === "register" ? "is-active" : ""}
              type="button"
              role="tab"
              aria-selected={mode === "register"}
              onClick={() => setMode("register")}
            >
              注册
            </button>
          </div>

          <form className="auth-form" onSubmit={(event) => void handleSubmit(event)}>
            <label className="field">
              <span>邮箱</span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            <label className="field">
              <span>密码（至少 8 位）</span>
              <input
                type="password"
                autoComplete={mode === "register" ? "new-password" : "current-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={8}
                required
              />
            </label>
            {(formError || error) && <p className="notice error-notice">{formError ?? error}</p>}
            <button className="primary-button" type="submit" disabled={pending || !cloudReady}>
              {pending ? "请稍候…" : mode === "register" ? "注册并同步" : "登录并同步"}
            </button>
          </form>
        </section>
      )}
    </main>
  );
}
