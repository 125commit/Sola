"use client";

import { useEffect, useState } from "react";

const DISMISS_KEY = "tally-pwa-install-dismissed";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandaloneDisplay(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
  );
}

function isIosDevice(): boolean {
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/**
 * 【做什么】在尚未安装时提示用户把 Sola 加到主屏幕。
 * 【何时调用】根布局挂载后；已安装或用户关闭过则不再显示。
 */
export function PwaInstaller() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    if (isStandaloneDisplay()) {
      return;
    }

    try {
      if (window.localStorage.getItem(DISMISS_KEY) === "1") {
        return;
      }
    } catch {
      // NOTE: 无法读取本地标记时仍展示一次，总比永远不知道能安装更好。
    }

    if (isIosDevice()) {
      // NOTE: 延后到下一轮任务再展示，避免 effect 里同步 setState。
      const timer = window.setTimeout(() => {
        setIosHint(true);
        setVisible(true);
      }, 0);
      return () => window.clearTimeout(timer);
    }

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
      setVisible(true);
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  /**
   * 【做什么】调用浏览器原生安装流程；用户取消则保留横幅，接受后收起。
   * 【何时调用】Android / 桌面 Chrome 点击“添加到主屏幕”时。
   */
  async function handleInstall() {
    if (!installEvent) {
      return;
    }
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === "accepted") {
      setVisible(false);
    }
  }

  function handleDismiss() {
    setVisible(false);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // 忽略：本次会话不再展示即可。
    }
  }

  if (!visible) {
    return null;
  }

  return (
    <aside className="pwa-banner" role="dialog" aria-label="安装到主屏幕">
      <div>
        <p className="eyebrow">安装应用</p>
        <strong>把 Sola 放到主屏幕</strong>
        <p>
          {iosHint
            ? "用 Safari 打开，点底部分享按钮，再选“添加到主屏幕”。"
            : "安装后可像普通 App 一样打开，不必每次找浏览器标签。"}
        </p>
      </div>
      <div className="pwa-banner-actions">
        {!iosHint && installEvent && (
          <button className="primary-button compact" type="button" onClick={() => void handleInstall()}>
            添加到主屏幕
          </button>
        )}
        <button className="secondary-button" type="button" onClick={handleDismiss}>
          先不用
        </button>
      </div>
    </aside>
  );
}
