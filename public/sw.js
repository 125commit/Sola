const CACHE_NAME = "tally-shell-v4";
const APP_SHELL = [
  "/",
  "/add",
  "/analysis",
  "/account",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
];

/**
 * 【做什么】安装时尽量缓存基础页面，使已打开过的账本在短暂断网时仍可进入。
 * 【何时调用】浏览器首次注册或 service worker 版本更新时。
 */
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // CHANGED: 不再使用 addAll；任意一个地址失败都会导致整个 SW 安装失败，手机就无法安装 PWA。
      await Promise.all(APP_SHELL.map((url) => cache.add(url).catch(() => undefined)));
      await self.skipWaiting();
    })(),
  );
});

/**
 * 【做什么】删除旧缓存，避免升级后继续读取过期页面。
 * 【何时调用】新 service worker 接管页面时。
 */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

/**
 * 【做什么】页面资源优先联网，断网时回退缓存；识别和账号 API 永不缓存。
 * 【何时调用】PWA 发起同源 GET 请求时。
 */
self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);

  // WARN: API 返回可能包含账单或会话信息，任何情况下都不写入浏览器缓存。
  if (event.request.method !== "GET" || requestUrl.pathname.startsWith("/api/")) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached ?? caches.match("/"))),
  );
});
