/**
 * 【做什么】生成跨设备稳定的账目标识。
 * 【何时调用】新建支出、旧数据升级，或同步快照缺少 syncId 时。
 */
export function createSyncId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  // NOTE: 极旧浏览器没有 randomUUID 时仍要能记账，登录同步前足够唯一即可。
  return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
