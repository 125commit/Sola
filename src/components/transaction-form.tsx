"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ChangeEvent, type FormEvent, useEffect, useState, type ReactNode } from "react";

import { yuanToCents } from "@/lib/analytics";
import { CATEGORIES } from "@/lib/categories";
import { useAuth } from "@/components/auth-provider";
import {
  addScreenshotTransactions,
  addTransaction,
  DuplicateImageError,
  hasImageHash,
  updateTransaction,
} from "@/lib/db";
import { JUST_SAVED_STORAGE_KEY } from "@/lib/ledger-view";
import {
  compressReceiptImageForUpload,
  hashImageFile,
  MAX_SOURCE_IMAGE_BYTES,
  validateReceiptImage,
} from "@/lib/image";
import {
  normalizeReceiptDateTime,
  ParsedReceiptBatchSchema,
} from "@/lib/receipt-schema";
import type { Transaction, TransactionDraft } from "@/lib/types";

interface TransactionFormProps {
  initial?: Transaction;
  onSaved?: () => void;
}

/** 一条截图支出在用户确认前的可编辑表单状态。 */
interface ExpenseFormDraft {
  key: string;
  amount: string;
  category: string;
  merchant: string;
  occurredAt: string;
  note: string;
  confidence: number;
}

/**
 * 【做什么】把刚确认的笔数留给首页，返回总览时立刻提示。
 * 【何时调用】IndexedDB 写入成功、即将跳转首页前。
 */
function rememberJustSaved(count: number) {
  try {
    sessionStorage.setItem(JUST_SAVED_STORAGE_KEY, JSON.stringify({ count, at: Date.now() }));
  } catch {
    // 隐私模式写不了提示标记；IndexedDB 入账不受影响。
  }
}

/**
 * 【做什么】整块热区就是 file input，手指直接点在系统选图控件上。
 * 【何时调用】「选择截图」和「换一张截图」。
 * 【原因】小米等浏览器「加到主屏幕」后用精简 WebView：label 转发点击、opacity≈0 的覆盖层
 * 常能点出变色却打不开相册；浏览器标签页正常。独立窗口必须让 input 自己接点击。
 */
function ScreenshotPicker({
  pickerKey,
  busy,
  label,
  className,
  children,
  onSelect,
}: {
  pickerKey: number;
  busy: boolean;
  label: string;
  className?: string;
  children?: ReactNode;
  onSelect: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className={`upload-hit ${busy ? "is-busy" : ""} ${className ?? ""}`}>
      {children}
      <span className="upload-button-face" aria-hidden="true">
        {label}
      </span>
      {busy ? null : (
        <input
          key={pickerKey}
          className="upload-file-overlay"
          type="file"
          // NOTE: 同时写 MIME 与扩展名；部分国产 WebView 只认其一，image/* 单独会打不开图库。
          accept="image/*,image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
          aria-label={label}
          onChange={onSelect}
        />
      )}
    </div>
  );
}

/**
 * 【做什么】把 Date 转成浏览器 datetime-local 控件需要的本地时间。
 * 【何时调用】创建新表单的默认发生时间时，避免 UTC 转换造成日期偏移。
 */
function toLocalDateTimeValue(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/**
 * 【做什么】判断当前是否从主屏幕独立窗口打开。
 * 【何时调用】记一笔页首次渲染，决定是否显示选图受限提示。
 */
function readStandaloneDisplay(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
  );
}

/**
 * 【做什么】提供手动填写支出、截图识别预填和最终确认入账。
 * 【何时调用】新增支出页面，或首页编辑既有支出时。
 */
export function TransactionForm({ initial, onSaved }: TransactionFormProps) {
  const router = useRouter();
  const { ready: authReady, cloudReady, user } = useAuth();
  // CHANGED: 线上已开放登录时，未登录不能点识别，避免把百炼额度暴露给匿名请求。
  const needsLoginForRecognition = authReady && cloudReady && !user;
  const [amount, setAmount] = useState(
    initial ? (initial.amountCents / 100).toFixed(2) : "",
  );
  const [category, setCategory] = useState(initial?.category ?? "food");
  const [merchant, setMerchant] = useState(initial?.merchant ?? "");
  const [occurredAt, setOccurredAt] = useState(initial?.occurredAt ?? toLocalDateTimeValue());
  const [note, setNote] = useState(initial?.note ?? "");
  const [source, setSource] = useState<"manual" | "screenshot">(initial?.source ?? "manual");
  const [imageHash, setImageHash] = useState(initial?.imageHash);
  const [batchDrafts, setBatchDrafts] = useState<ExpenseFormDraft[] | null>(null);
  const [ignoredCount, setIgnoredCount] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [pickerKey, setPickerKey] = useState(0);
  const [isStandalonePwa] = useState(readStandaloneDisplay);
  const canPickScreenshot = authReady && !needsLoginForRecognition && !isRecognizing;

  // WARN: 预览只使用临时 Blob URL；切换图片或离开页面时立即释放内存。
  useEffect(
    () => () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    },
    [previewUrl],
  );

  /**
   * 【做什么】把选中的截图交给识别流程。
   * 【何时调用】用户点在覆盖按钮的透明 file input 上并选出图片后。
   */
  async function handleImageSelection(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    setError(null);
    setStatus(null);

    if (needsLoginForRecognition) {
      setError("请先登录后再使用截图识别，你仍可手动记账");
      return;
    }

    const validationError = validateReceiptImage(file, MAX_SOURCE_IMAGE_BYTES);
    if (validationError) {
      setError(validationError);
      return;
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(URL.createObjectURL(file));
    setIsRecognizing(true);

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 35_000);

    try {
      const hash = await hashImageFile(file);

      // WARN: 已入账图片直接停止识别，避免用户在确认前再次制造重复流水。
      if (await hasImageHash(hash)) {
        setError("这张截图已经记过账，请选择其他图片");
        return;
      }

      // CHANGED: 先压缩再上传 → 否则超过 4.5 MB 的手机原图会在 Vercel 直接 413。
      const uploadFile = await compressReceiptImageForUpload(file);
      const formData = new FormData();
      formData.append("image", uploadFile);
      const response = await fetch("/api/receipts/parse", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        batch?: unknown;
        error?: string;
      };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "识别失败，请手动填写");
      }

      const parsed = ParsedReceiptBatchSchema.safeParse(payload.batch);
      if (!parsed.success) {
        throw new Error("识别结果格式异常，请手动填写");
      }

      const { expenses, ignored_count: nextIgnoredCount } = parsed.data;
      if (expenses.length === 0) {
        throw new Error(
          nextIgnoredCount > 0
            ? `没有识别到可靠支出，已忽略 ${nextIgnoredCount} 条非支出或不确定记录`
            : "没有识别到可靠支出，请手动填写",
        );
      }

      const nextDrafts = expenses.map((expense, index): ExpenseFormDraft => {
        const detailNote = [
          expense.payment_method && `支付方式：${expense.payment_method}`,
          expense.notes,
        ]
          .filter(Boolean)
          .join("；");
        return {
          key: `${hash}:${index}`,
          amount: expense.amount_yuan.toFixed(2),
          category: expense.category_guess ?? "other",
          merchant: expense.merchant ?? "",
          occurredAt: normalizeReceiptDateTime(expense.occurred_at) ?? "",
          note: detailNote,
          confidence: expense.confidence,
        };
      });

      setBatchDrafts(nextDrafts);
      setIgnoredCount(nextIgnoredCount);
      setSource("screenshot");
      setImageHash(hash);

      // NOTE: 所有候选都进入可编辑列表；低置信度或缺时间项目由用户逐条补全。
      const needsReview = nextDrafts.some(
        (draft) => draft.confidence < 0.7 || !draft.occurredAt,
      );
      setStatus(
        `识别出 ${nextDrafts.length} 笔支出${
          nextIgnoredCount > 0 ? `，已忽略 ${nextIgnoredCount} 条非支出或不确定记录` : ""
        }。${needsReview ? "部分信息不完整，请重点核对。" : "请逐条核对后一次入账。"}`,
      );
    } catch (caught) {
      setBatchDrafts(null);
      setIgnoredCount(0);
      setSource("manual");
      setImageHash(undefined);
      const timedOut = caught instanceof Error && caught.name === "AbortError";
      setError(
        timedOut
          ? "识别超时，请换一张截图或手动填写"
          : caught instanceof Error
            ? caught.message
            : "识别失败，请手动填写",
      );
    } finally {
      window.clearTimeout(timeout);
      setIsRecognizing(false);
      // CHANGED: 识别结束后换掉旧 input。Android Chrome 复用同一个 file input 时，第二次 change 经常不来。
      setPickerKey((key) => key + 1);
    }
  }

  /**
   * 【做什么】修改批量候选中的单个字段，不影响同截图的其他支出。
   * 【何时调用】用户核对某张候选卡片的金额、类别、时间或说明时。
   */
  function updateBatchDraft(key: string, patch: Partial<ExpenseFormDraft>) {
    setBatchDrafts(
      (current) =>
        current?.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft)) ?? null,
    );
  }

  /**
   * 【做什么】从本次批量确认中移除误识别或不想记录的支出。
   * 【何时调用】用户点击候选卡片的“移除”按钮时。
   */
  function removeBatchDraft(key: string) {
    setBatchDrafts((current) => {
      const next = current?.filter((draft) => draft.key !== key) ?? [];

      // NOTE: 全部移除后回到手动表单，避免提交一个空批次。
      if (next.length === 0) {
        setSource("manual");
        setImageHash(undefined);
        setStatus("已移除全部识别结果，你可以手动记账或重新选择截图");
        return null;
      }
      return next;
    });
  }

  /**
   * 【做什么】把单笔支出表单或整批截图候选转换为整数分账目并持久化。
   * 【何时调用】用户核对完字段后点击确认、批量入账或保存修改时。
   */
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setStatus(null);

    if (!initial && batchDrafts) {
      const invalidIndex = batchDrafts.findIndex(
        (draft) => yuanToCents(draft.amount) === null || !draft.occurredAt,
      );
      if (invalidIndex >= 0) {
        setError(`第 ${invalidIndex + 1} 笔的金额或时间不完整，请核对`);
        return;
      }
      if (!imageHash) {
        setError("截图指纹已失效，请重新选择截图");
        return;
      }

      const drafts: TransactionDraft[] = batchDrafts.map((draft) => ({
        type: "expense",
        amountCents: yuanToCents(draft.amount) as number,
        category: draft.category,
        merchant: draft.merchant.trim(),
        occurredAt: draft.occurredAt,
        note: draft.note.trim(),
        source: "screenshot",
      }));

      setIsSaving(true);
      try {
        await addScreenshotTransactions(drafts, imageHash);
        rememberJustSaved(drafts.length);
        onSaved?.();
        router.push("/");
      } catch (caught) {
        setError(
          caught instanceof DuplicateImageError
            ? caught.message
            : caught instanceof Error
              ? caught.message
              : "批量保存失败，请重试",
        );
      } finally {
        setIsSaving(false);
      }
      return;
    }

    const amountCents = yuanToCents(amount);
    if (amountCents === null) {
      setError("请输入大于 0、最多两位小数的金额");
      return;
    }
    if (!occurredAt) {
      setError("请选择交易时间");
      return;
    }

    const draft: TransactionDraft = {
      type: "expense",
      amountCents,
      category,
      merchant: merchant.trim(),
      occurredAt,
      note: note.trim(),
      source,
      imageHash,
    };

    setIsSaving(true);
    try {
      if (initial?.id !== undefined) {
        await updateTransaction(initial.id, draft);
      } else {
        await addTransaction(draft);
        rememberJustSaved(1);
      }
      onSaved?.();
      if (!initial) {
        router.push("/");
      }
    } catch (caught) {
      setError(
        caught instanceof DuplicateImageError
          ? caught.message
          : caught instanceof Error
            ? caught.message
            : "保存失败，请重试",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="transaction-form" onSubmit={handleSubmit}>
      {!initial && (
        <section className="upload-card" aria-labelledby="upload-title">
          <div>
            <p className="eyebrow">AI 截图识别</p>
            <h2 id="upload-title">上传截图，提取全部支出</h2>
            <p className="muted">仅记录支出；识别结果可逐条修改或移除，原图不会保存。</p>
          </div>
          {needsLoginForRecognition && (
            <p className="notice sync-notice">
              <span>登录后才能使用截图识别，避免识别额度被滥用。你仍可在下方手动记账。</span>
              <Link href="/account">去登录</Link>
            </p>
          )}
          {isStandalonePwa && !needsLoginForRecognition && (
            <p className="notice sync-notice">
              若点「选择截图」没有弹出相册，这是部分手机「主屏幕应用」的限制。请用浏览器打开同一网址再选图。
            </p>
          )}
          {needsLoginForRecognition ? (
            <Link className="upload-hit" href="/account">
              <span className="upload-button-face">请先登录后再选截图</span>
            </Link>
          ) : !authReady ? (
            <div className="upload-hit is-busy">
              <span className="upload-button-face">正在准备…</span>
            </div>
          ) : (
            <ScreenshotPicker
              pickerKey={pickerKey}
              busy={isRecognizing}
              label={isRecognizing ? "正在识别…" : "选择截图"}
              onSelect={(event) => void handleImageSelection(event)}
            />
          )}
          {previewUrl && canPickScreenshot && (
            <ScreenshotPicker
              pickerKey={pickerKey}
              busy={isRecognizing}
              label={isRecognizing ? "正在识别…" : "换一张截图"}
              className="receipt-preview-hit"
              onSelect={(event) => void handleImageSelection(event)}
            >
              {/* Blob 预览不能走 next/image；预览热区同样是直接可点的 file input。 */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="receipt-preview" src={previewUrl} alt="待识别截图预览" />
            </ScreenshotPicker>
          )}
          {previewUrl && !canPickScreenshot && (
            <div className="upload-hit receipt-preview-hit is-busy">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="receipt-preview" src={previewUrl} alt="待识别截图预览" />
              <span>{isRecognizing ? "正在识别…" : "换一张截图"}</span>
            </div>
          )}
        </section>
      )}

      <section className="form-card">
        {batchDrafts ? (
          <>
            <div className="section-heading">
              <div>
                <p className="eyebrow">批量确认</p>
                <h2>核对 {batchDrafts.length} 笔支出</h2>
              </div>
              <span className="source-badge">
                {ignoredCount > 0 ? `已忽略 ${ignoredCount} 条非支出` : "仅记录支出"}
              </span>
            </div>

            <div className="batch-expense-list">
              {batchDrafts.map((draft, index) => (
                <article className="batch-expense-card" key={draft.key}>
                  <div className="batch-expense-heading">
                    <div>
                      <strong>第 {index + 1} 笔</strong>
                      <span className={draft.confidence < 0.7 ? "confidence-low" : ""}>
                        识别可信度 {(draft.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                    <button type="button" onClick={() => removeBatchDraft(draft.key)}>
                      移除
                    </button>
                  </div>

                  <div className="form-grid">
                    <label className="field">
                      <span>金额（元）</span>
                      <input
                        inputMode="decimal"
                        value={draft.amount}
                        onChange={(event) =>
                          updateBatchDraft(draft.key, { amount: event.target.value })
                        }
                        required
                      />
                    </label>
                    <label className="field">
                      <span>类别</span>
                      <select
                        value={draft.category}
                        onChange={(event) =>
                          updateBatchDraft(draft.key, { category: event.target.value })
                        }
                      >
                        {CATEGORIES.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="form-grid">
                    <label className="field">
                      <span>时间</span>
                      <input
                        type="datetime-local"
                        value={draft.occurredAt}
                        onChange={(event) =>
                          updateBatchDraft(draft.key, { occurredAt: event.target.value })
                        }
                        required
                      />
                    </label>
                    <label className="field">
                      <span>商户 / 对方</span>
                      <input
                        type="text"
                        value={draft.merchant}
                        maxLength={120}
                        onChange={(event) =>
                          updateBatchDraft(draft.key, { merchant: event.target.value })
                        }
                      />
                    </label>
                  </div>

                  <label className="field">
                    <span>备注</span>
                    <input
                      type="text"
                      value={draft.note}
                      maxLength={240}
                      onChange={(event) =>
                        updateBatchDraft(draft.key, { note: event.target.value })
                      }
                    />
                  </label>
                </article>
              ))}
            </div>

            {status && <p className="notice success-notice">{status}</p>}
            {error && <p className="notice error-notice">{error}</p>}
            <button className="primary-button" type="submit" disabled={isSaving || isRecognizing}>
              {isSaving ? "批量保存中…" : `一次记入 ${batchDrafts.length} 笔支出`}
            </button>
          </>
        ) : (
          <>
            <div className="section-heading">
              <div>
                <p className="eyebrow">{initial ? "编辑支出" : "确认后入账"}</p>
                <h2>{initial ? "修改这笔支出" : "核对支出信息"}</h2>
              </div>
              {source === "screenshot" && <span className="source-badge">截图预填</span>}
            </div>

            <label className="field amount-field">
              <span>金额（元）</span>
              <div className="amount-input">
                <span>¥</span>
                <input
                  inputMode="decimal"
                  placeholder="0.00"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  autoFocus={!initial}
                  required
                />
              </div>
            </label>

            <div className="form-grid">
              <label className="field">
                <span>类别</span>
                <select value={category} onChange={(event) => setCategory(event.target.value)}>
                  {CATEGORIES.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>时间</span>
                <input
                  type="datetime-local"
                  value={occurredAt}
                  onChange={(event) => setOccurredAt(event.target.value)}
                  required
                />
              </label>
            </div>

            <label className="field">
              <span>商户 / 对方</span>
              <input
                type="text"
                value={merchant}
                maxLength={120}
                placeholder="例如：便利店"
                onChange={(event) => setMerchant(event.target.value)}
              />
            </label>

            <label className="field">
              <span>备注</span>
              <textarea
                value={note}
                maxLength={240}
                placeholder="可选"
                onChange={(event) => setNote(event.target.value)}
              />
            </label>

            {status && <p className="notice success-notice">{status}</p>}
            {error && <p className="notice error-notice">{error}</p>}

            <button className="primary-button" type="submit" disabled={isSaving || isRecognizing}>
              {isSaving ? "保存中…" : initial ? "保存修改" : "确认记账"}
            </button>
          </>
        )}
      </section>
    </form>
  );
}
