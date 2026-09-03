"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  applyRemoteRecords,
  clearLocalLedger,
  listSyncRecords,
  subscribeLedgerChanges,
} from "@/lib/db";
import type { SyncRecord } from "@/lib/types";

const LEDGER_OWNER_KEY = "tally-ledger-owner";

export type SyncStatus = "idle" | "syncing" | "synced" | "error" | "offline";

export type AuthUser = {
  id: string;
  email: string;
};

type AuthContextValue = {
  ready: boolean;
  cloudReady: boolean;
  user: AuthUser | null;
  syncStatus: SyncStatus;
  lastSyncedAt: string | null;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  syncNow: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * 【做什么】记住当前浏览器账本属于哪个账号，避免换账号时把别人的支出上传上去。
 * 【何时调用】登录成功后、以及判断是否要清空本地账本时。
 */
function readLedgerOwner(): string | null {
  try {
    return window.localStorage.getItem(LEDGER_OWNER_KEY);
  } catch {
    return null;
  }
}

function writeLedgerOwner(userId: string) {
  try {
    window.localStorage.setItem(LEDGER_OWNER_KEY, userId);
  } catch {
    // NOTE: 隐私模式可能写不了 localStorage，最多导致换账号时多一次合并，不会丢云端数据。
  }
}

/**
 * 【做什么】提供登录态，并在账本变化时把 IndexedDB 与云端对齐。
 * 【何时调用】根布局包裹全部页面时。
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [cloudReady, setCloudReady] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const userRef = useRef<AuthUser | null>(null);
  const syncingRef = useRef(false);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const syncNow = useCallback(async () => {
    const currentUser = userRef.current;
    if (!currentUser || syncingRef.current) {
      return;
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setSyncStatus("offline");
      return;
    }

    syncingRef.current = true;
    setSyncStatus("syncing");
    setError(null);

    try {
      const records = await listSyncRecords();
      const response = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ records }),
      });
      const payload = await readJson(response);
      if (!response.ok || payload.ok !== true || !Array.isArray(payload.records)) {
        throw new Error(typeof payload.error === "string" ? payload.error : "同步失败，请稍后重试");
      }

      await applyRemoteRecords(payload.records as SyncRecord[]);
      setSyncStatus("synced");
      setLastSyncedAt(new Date().toISOString());
    } catch (caught) {
      setSyncStatus("error");
      setError(caught instanceof Error ? caught.message : "同步失败，请稍后重试");
    } finally {
      syncingRef.current = false;
    }
  }, []);

  const hydrateSession = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/me");
      const payload = await readJson(response);
      setCloudReady(payload.cloudReady === true);
      const nextUser =
        payload.user && typeof payload.user === "object"
          ? (payload.user as AuthUser)
          : null;
      setUser(nextUser);
      userRef.current = nextUser;
      if (nextUser) {
        const previousOwner = readLedgerOwner();
        // WARN: 同一浏览器换了邮箱就必须丢掉上一个账号的本地账，否则会串账。
        if (previousOwner && previousOwner !== nextUser.id) {
          await clearLocalLedger();
        }
        writeLedgerOwner(nextUser.id);
        await syncNow();
      }
    } catch {
      setCloudReady(false);
    } finally {
      setReady(true);
    }
  }, [syncNow]);

  useEffect(() => {
    // NOTE: 放到下一轮任务再拉会话，避免在 effect 体内同步 setState 触发级联渲染。
    const timer = window.setTimeout(() => {
      void hydrateSession();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [hydrateSession]);

  useEffect(() => {
    let timer: number | undefined;
    const scheduleSync = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void syncNow();
      }, 500);
    };

    const unsubscribe = subscribeLedgerChanges(scheduleSync);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void syncNow();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", scheduleSync);

    return () => {
      unsubscribe();
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", scheduleSync);
    };
  }, [syncNow]);

  const authenticate = useCallback(
    async (path: "/api/auth/login" | "/api/auth/register", email: string, password: string) => {
      setError(null);
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const payload = await readJson(response);
      if (!response.ok || payload.ok !== true || !payload.user || typeof payload.user !== "object") {
        throw new Error(typeof payload.error === "string" ? payload.error : "登录失败，请重试");
      }

      const nextUser = payload.user as AuthUser;
      const previousOwner = readLedgerOwner();
      if (previousOwner && previousOwner !== nextUser.id) {
        await clearLocalLedger();
      }
      writeLedgerOwner(nextUser.id);
      setUser(nextUser);
      userRef.current = nextUser;
      await syncNow();
    },
    [syncNow],
  );

  const login = useCallback(
    (email: string, password: string) => authenticate("/api/auth/login", email, password),
    [authenticate],
  );

  const register = useCallback(
    (email: string, password: string) => authenticate("/api/auth/register", email, password),
    [authenticate],
  );

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    userRef.current = null;
    setSyncStatus("idle");
    setLastSyncedAt(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ready,
      cloudReady,
      user,
      syncStatus,
      lastSyncedAt,
      error,
      login,
      register,
      logout,
      syncNow,
    }),
    [ready, cloudReady, user, syncStatus, lastSyncedAt, error, login, register, logout, syncNow],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * 【做什么】读取当前登录和同步状态。
 * 【何时调用】账号页、导航和需要展示“未登录可同步”提示的界面。
 */
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth 必须放在 AuthProvider 内");
  }
  return value;
}
