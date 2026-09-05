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
  install: () => Promise<"accepted" | "dismissed" | "unavailable">
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
  const [platform] = useState(detectPlatform);
  const deferredRef = useRef<BeforeInstallPromptEvent | null>(null);

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
      deferredRef.current = null;
      setCanPrompt(false);
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
    await event.prompt();
    const choice = await event.userChoice;
    deferredRef.current = null;
    setCanPrompt(false);
    if (choice.outcome === "accepted") {
      setBannerVisible(false);
      setInstalled(true);
    }
    return choice.outcome;
  }, []);

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
      install,
      dismissBanner,
      reopenBanner,
    }),
    [ready, installed, canPrompt, platform, bannerVisible, install, dismissBanner, reopenBanner],
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

function installHint(platform: PwaPlatform, canPrompt: boolean): string {
  if (canPrompt) {
    return "点下面按钮即可安装。装好后可像普通 App 一样从主屏幕打开。";
  }
  if (platform === "ios") {
    return "Safari 不提供一键安装。请点底部分享 →「添加到主屏幕」。";
  }
  if (platform === "android") {
    return "若没有安装按钮：请用 Chrome 打开本站，点右上角 ⋮ →「安装应用」或「添加到主屏幕」。小米浏览器的添加到主屏幕相册可能异常，建议用 Chrome 安装。";
  }
  if (platform === "desktop") {
    return "请用 Chrome / Edge 打开，地址栏右侧若有安装图标可点它；或打开菜单 →「安装 Sola…」。本地 http 开发环境通常无法安装。";
  }
  return "请用支持 PWA 的浏览器（推荐 Chrome）打开本站后再试安装。";
}

/**
 * 【做什么】底部安装提示条；可一键安装或展示手动步骤。
 * 【何时调用】根布局；已安装或用户关闭后隐藏。
 */
export function PwaInstallBanner() {
  const { installed, canPrompt, platform, bannerVisible, install, dismissBanner } = usePwaInstall();

  if (installed || !bannerVisible) {
    return null;
  }

  return (
    <aside className="pwa-banner" role="dialog" aria-label="安装到主屏幕">
      <div>
        <p className="eyebrow">安装应用</p>
        <strong>把 Sola 放到主屏幕</strong>
        <p>{installHint(platform, canPrompt)}</p>
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
  const { ready, installed, canPrompt, platform, install, reopenBanner } = usePwaInstall();

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
      <p className="muted">{installHint(platform, canPrompt)}</p>
      <div className="account-actions">
        {canPrompt ? (
          <button className="primary-button" type="button" onClick={() => void install()}>
            安装到主屏幕
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
