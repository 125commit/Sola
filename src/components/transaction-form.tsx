"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { type ChangeEvent, type FormEvent, useEffect, useState } from "react";

import { yuanToCents } from "@/lib/analytics";
import { CATEGORIES } from "@/lib/categories";
import {
  addScreenshotTransactions,
  addTransaction,
  DuplicateImageError,
  hasImageHash,
  updateTransaction,
} from "@/lib/db";
import { hashImageFile, validateReceiptImage } from "@/lib/image";
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
 * 【做什么】提供手动填写支出、截图识别预填和最终确认入账。
 * 【何时调用】新增支出页面，或首页编辑既有支出时。
 */
export function TransactionForm({ initial, onSaved }: TransactionFormProps) {
  const router = useRouter();
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
   * 【做什么】校验图片、检查重复并请求视觉识别后预填多笔支出。
   * 【何时调用】新增支出时选择一张支付截图后。
   */
  async function handleImageSelection(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setError(null);
    setStatus(null);
    const validationError = validateReceiptImage(file);
    if (validationError) {
      setError(validationError);
      event.target.value = "";
      return;
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(URL.createObjectURL(file));
    setIsRecognizing(true);

    try {
      const hash = await hashImageFile(file);

      // WARN: 已入账图片直接停止识别，避免用户在确认前再次制造重复流水。
      if (await hasImageHash(hash)) {
        setError("这张截图已经记过账，请选择其他图片");
        return;
      }

      const formData = new FormData();
      formData.append("image", file);
      const response = await fetch("/api/receipts/parse", {
        method: "POST",
        body: formData,
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
      setError(caught instanceof Error ? caught.message : "识别失败，请手动填写");
    } finally {
      setIsRecognizing(false);
      event.target.value = "";
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
        onSaved?.();
        router.push("/");
        router.refresh();
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
      }
      onSaved?.();
      router.push("/");
      router.refresh();
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
          <label className={`upload-button ${isRecognizing ? "is-disabled" : ""}`}>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleImageSelection}
              disabled={isRecognizing}
            />
            {isRecognizing ? "正在识别…" : "选择截图"}
          </label>
          {previewUrl && (
            <Image
              className="receipt-preview"
              src={previewUrl}
              alt="待识别截图预览"
              width={720}
              height={1280}
              unoptimized
            />
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
