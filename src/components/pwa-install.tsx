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

const DISMISS_KEY = "tally-pwa-install-dismissed";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export type PwaPlatform = "ios" | "android" | "desktop" | "other";

type PwaInstallContextValue = {
  ready: boolean;
  installed: boolean;
  canPrompt: boolean;
  platform: PwaPlatform;
  bannerVisible: boolean;
  /** Chrome 点了安装却迟迟不完成时为 true（国内 WebAPK 常见）。 */
  installLikelyStuck: boolean;
  install: () => Promise<"accepted" | "dismissed" | "unavailable">;
  dismissBanner: () => void;
  reopenBanner: () => void;
};

const PwaInstallContext = createContext<PwaInstallContextValue | null>(null);

function detectPlatform(): PwaPlatform {
  if (typeof navigator === "undefined") {
    return "other";
  }
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) {
    return "ios";
  }
  if (/android/i.test(ua)) {
    return "android";
  }
  if (/windows|macintosh|linux/i.test(ua) && !/mobile/i.test(ua)) {
    return "desktop";
  }
  return "other";
}

function readStandalone(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
  );
}

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * 【做什么】统一捕获 Chrome 的安装事件，并给横幅/账号页共用。
 * 【何时调用】根布局包裹整站时。
 */
export function PwaInstallProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [canPrompt, setCanPrompt] = useState(false);
  const [bannerVisible, setBannerVisible] = useState(false);
  const [installLikelyStuck, setInstallLikelyStuck] = useState(false);
  const [platform] = useState(detectPlatform);
  const deferredRef = useRef<BeforeInstallPromptEvent | null>(null);
  const stuckTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const standalone = readStandalone();
    const showBanner = !standalone && !readDismissed();

    // NOTE: 放到下一轮再写状态，避免 effect 内同步 setState 触发级联渲染告警。
    const timer = window.setTimeout(() => {
      setInstalled(standalone);
      setReady(true);
      if (showBanner) {
        setBannerVisible(true);
      }
    }, 0);

    if (standalone) {
      return () => window.clearTimeout(timer);
    }

    const onPrompt = (event: Event) => {
      event.preventDefault();
      deferredRef.current = event as BeforeInstallPromptEvent;
      setCanPrompt(true);
      if (!readDismissed()) {
        setBannerVisible(true);
      }
    };
    const onInstalled = () => {
      window.clearTimeout(stuckTimerRef.current);
      deferredRef.current = null;
      setCanPrompt(false);
      setInstallLikelyStuck(false);
      setInstalled(true);
      setBannerVisible(false);
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    const event = deferredRef.current;
    if (!event) {
      return "unavailable" as const;
    }

    setInstallLikelyStuck(false);
    window.clearTimeout(stuckTimerRef.current);
    // WARN: 国内 Chrome 生成 WebAPK 常要访问 Google；超时后提示改用「添加到主屏幕」。
    stuckTimerRef.current = window.setTimeout(() => {
      setInstallLikelyStuck(true);
    }, 12_000);

    try {
      await event.prompt();
      const choice = await event.userChoice;
      deferredRef.current = null;
      setCanPrompt(false);
      if (choice.outcome === "accepted") {
        setBannerVisible(false);
        // NOTE: 不立刻标 installed——要等 appinstalled，或用户其实卡在「正在安装」。
      } else {
        window.clearTimeout(stuckTimerRef.current);
        setInstallLikelyStuck(false);
      }
      return choice.outcome;
    } catch {
      window.clearTimeout(stuckTimerRef.current);
      setInstallLikelyStuck(true);
      return "unavailable" as const;
    }
  }, []);

  useEffect(
    () => () => {
      window.clearTimeout(stuckTimerRef.current);
    },
    [],
  );

  const dismissBanner = useCallback(() => {
    setBannerVisible(false);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // 写不了也只影响本次会话。
    }
  }, []);

  const reopenBanner = useCallback(() => {
    try {
      window.localStorage.removeItem(DISMISS_KEY);
    } catch {
      // ignore
    }
    if (!readStandalone()) {
      setBannerVisible(true);
    }
  }, []);

  const value = useMemo(
    () => ({
      ready,
      installed,
      canPrompt,
      platform,
      bannerVisible,
      installLikelyStuck,
      install,
      dismissBanner,
      reopenBanner,
    }),
    [
      ready,
      installed,
      canPrompt,
      platform,
      bannerVisible,
      installLikelyStuck,
      install,
      dismissBanner,
      reopenBanner,
    ],
  );

  return <PwaInstallContext.Provider value={value}>{children}</PwaInstallContext.Provider>;
}

/**
 * 【做什么】读取安装状态与触发安装的方法。
 * 【何时调用】安装横幅、账号页安装卡片。
 */
export function usePwaInstall(): PwaInstallContextValue {
  const value = useContext(PwaInstallContext);
  if (!value) {
    throw new Error("usePwaInstall 必须放在 PwaInstallProvider 内");
  }
  return value;
}

function installHint(platform: PwaPlatform, canPrompt: boolean, installLikelyStuck: boolean): string {
  if (installLikelyStuck) {
    return "若一直停在「正在安装」，多半是 Chrome 在打包应用时连不上 Google 服务（国内常见）。请取消后改用：Chrome 右上角 ⋮ →「添加到主屏幕」。或开 VPN 后再点「安装应用」。日常记账直接用浏览器打开网址即可。";
  }
  if (canPrompt) {
    return "可点下方按钮尝试安装。若进度一直停在「正在安装」，请改用菜单里的「添加到主屏幕」，或直接用浏览器使用本站。";
  }
  if (platform === "ios") {
    return "Safari 不提供一键安装。请点底部分享 →「添加到主屏幕」。";
  }
  if (platform === "android") {
    return "请用 Chrome 打开本站，点右上角 ⋮。若有「安装应用」且一直转圈，请改选「添加到主屏幕」。小米浏览器加桌面后选图可能异常；日常也可不安装，直接用浏览器。";
  }
  if (platform === "desktop") {
    return "请用 Chrome / Edge 打开，地址栏右侧若有安装图标可点它。本地 http 开发环境通常无法安装。";
  }
  return "请用支持 PWA 的浏览器打开本站后再试。直接用浏览器记账也完全可以。";
}

/**
 * 【做什么】底部安装提示条；可一键安装或展示手动步骤。
 * 【何时调用】根布局；已安装或用户关闭后隐藏。
 */
export function PwaInstallBanner() {
  const { installed, canPrompt, platform, bannerVisible, installLikelyStuck, install, dismissBanner } =
    usePwaInstall();

  if (installed || !bannerVisible) {
    return null;
  }

  return (
    <aside className="pwa-banner" role="dialog" aria-label="安装到主屏幕">
      <div>
        <p className="eyebrow">安装应用</p>
        <strong>把 Sola 放到主屏幕</strong>
        <p>{installHint(platform, canPrompt, installLikelyStuck)}</p>
      </div>
      <div className="pwa-banner-actions">
        {canPrompt && (
          <button className="primary-button compact" type="button" onClick={() => void install()}>
            安装到主屏幕
          </button>
        )}
        <button className="secondary-button" type="button" onClick={dismissBanner}>
          先不用
        </button>
      </div>
    </aside>
  );
}

/**
 * 【做什么】账号页常驻的安装说明与按钮，不依赖底部横幅是否被关掉。
 * 【何时调用】账号页。
 */
export function PwaInstallCard() {
  const { ready, installed, canPrompt, platform, installLikelyStuck, install, reopenBanner } = usePwaInstall();

  if (!ready) {
    return null;
  }

  if (installed) {
    return (
      <section className="content-card account-card">
        <p className="eyebrow">主屏幕应用</p>
        <h2>已安装</h2>
        <p className="muted">你正在独立窗口中使用 Sola。若选图异常，可用浏览器打开同一网址。</p>
      </section>
    );
  }

  return (
    <section className="content-card account-card">
      <p className="eyebrow">主屏幕应用</p>
      <h2>安装到主屏幕</h2>
      <p className="muted">{installHint(platform, canPrompt, installLikelyStuck)}</p>
      {installLikelyStuck && (
        <p className="notice sync-notice">
          推荐做法：Chrome ⋮ →「添加到主屏幕」。不必强求「安装应用」成功。
        </p>
      )}
      <div className="account-actions">
        {canPrompt ? (
          <button className="primary-button" type="button" onClick={() => void install()}>
            尝试安装
          </button>
        ) : (
          <button className="secondary-button" type="button" onClick={reopenBanner}>
            显示安装提示
          </button>
        )}
      </div>
    </section>
  );
}
