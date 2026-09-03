import type { SyncRecord } from "@/lib/types";

/**
 * 【做什么】按 syncId 合并两端账本，同一笔账保留更新时间更晚的版本。
 * 【何时调用】单元测试验证同步规则，以及需要在内存中预览合并结果时。
 */
export function mergeLedger(local: SyncRecord[], remote: SyncRecord[]): SyncRecord[] {
  const merged = new Map<string, SyncRecord>();

  for (const record of local) {
    merged.set(record.syncId, record);
  }

  for (const record of remote) {
    const current = merged.get(record.syncId);
    // NOTE: 后写入且 updatedAt 更大的一侧获胜，避免两台设备同时改同一笔时各留一份。
    if (!current || record.updatedAt >= current.updatedAt) {
      merged.set(record.syncId, record);
    }
  }

  return [...merged.values()];
}

/**
 * 【做什么】判断这笔云端快照是否还应该出现在账本界面。
 * 【何时调用】同步完成后过滤墓碑记录，或统计前丢掉已删除支出。
 */
export function isActiveSyncRecord(record: SyncRecord): boolean {
  return !record.deletedAt;
}
