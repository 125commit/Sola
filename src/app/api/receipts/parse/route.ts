import { NextResponse } from "next/server";

import { getCloudAuthConfig, getSessionUser } from "@/lib/auth";
import { validateReceiptImage } from "@/lib/image";
import {
  parseReceiptBatchModelOutput,
  RECEIPT_BATCH_OUTPUT_EXAMPLE,
} from "@/lib/receipt-schema";

export const runtime = "nodejs";

const DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const DEFAULT_MODEL = "qwen3-vl-plus";
const REQUEST_TIMEOUT_MS = 30_000;

type QwenResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
};

/**
 * 【做什么】接收单张截图并通过 Qwen-VL 提取其中全部待确认支出。
 * 【何时调用】新增账目页面主动选择图片并点击识别后。
 * 【副作用】图片只存在于本次请求内，不写磁盘、不进入日志或本地账本。
 */
export async function POST(request: Request): Promise<NextResponse> {
  const cloudAuth = getCloudAuthConfig();
  if (cloudAuth.ready) {
    const user = await getSessionUser();
    // CHANGED: 线上配好登录后必须带会话 → 避免公开站点被刷百炼额度。未配数据库的本机仍可识别。
    if (!user) {
      return NextResponse.json(
        { ok: false, code: "LOGIN_REQUIRED", error: "请先登录后再使用截图识别" },
        { status: 401 },
      );
    }
  }

  const apiKey = process.env.DASHSCOPE_API_KEY;

  // NOTE: 未配置密钥时明确降级，手动记账页面仍可继续使用。
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, code: "MISSING_API_KEY", error: "尚未配置截图识别，请先手动记账" },
      { status: 503 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { ok: false, code: "INVALID_FORM", error: "上传内容无法读取" },
      { status: 400 },
    );
  }

  const image = formData.get("image");
  if (!(image instanceof File)) {
    return NextResponse.json(
      { ok: false, code: "IMAGE_REQUIRED", error: "请选择一张支付截图" },
      { status: 400 },
    );
  }

  const imageError = validateReceiptImage(image);
  if (imageError) {
    return NextResponse.json(
      { ok: false, code: "INVALID_IMAGE", error: imageError },
      { status: 400 },
    );
  }

  const baseUrl = (process.env.DASHSCOPE_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  const model = process.env.DASHSCOPE_VISION_MODEL ?? DEFAULT_MODEL;
  const prompt = buildExtractionPrompt();
  const imageBase64 = Buffer.from(await image.arrayBuffer()).toString("base64");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        max_tokens: 2_000,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: `data:${image.type};base64,${imageBase64}`,
                },
              },
              { type: "text", text: prompt },
            ],
          },
        ],
      }),
      signal: controller.signal,
    });

    // WARN: 上游错误不透传响应正文，避免供应商调试信息或请求片段进入浏览器。
    if (!upstream.ok) {
      return NextResponse.json(
        { ok: false, code: "UPSTREAM_ERROR", error: "识别服务暂时不可用，请稍后重试或手动填写" },
        { status: 502 },
      );
    }

    const payload = (await upstream.json()) as QwenResponse;
    const content = getTextContent(payload);
    const batch = parseReceiptBatchModelOutput(content);
    return NextResponse.json({ ok: true, batch });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return NextResponse.json(
      {
        ok: false,
        code: timedOut ? "TIMEOUT" : "PARSE_ERROR",
        error: timedOut ? "识别超时，请重试或手动填写" : "未能可靠识别这张图片，请手动填写",
      },
      { status: timedOut ? 504 : 422 },
    );
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * 【做什么】构造批量支出提取规则，明确忽略收入和汇总数字。
 * 【何时调用】每次向视觉模型提交支付截图前。
 */
function buildExtractionPrompt(): string {
  return `你是消费流水截图字段提取器。找出图片中每一笔已经发生的支出，并且只输出一个 JSON 对象，不要 Markdown 或解释。

规则：
1. 扫描整张图片；交易列表有多笔支出时，每笔各生成一个 expenses 元素，保持图片中的顺序。
2. 只提取支出/付款/消费。收入、收款、退款到账、余额变动中的入账项目全部忽略，并计入 ignored_count。
3. amount_yuan 取每笔真实支出金额；不要把月度总额、余额、原价、优惠、积分或页面汇总当作交易。
4. 金额必须清晰且大于 0；金额不清晰、交易状态失败或无法确认是支出时，不要加入 expenses，计入 ignored_count。
5. occurred_at 取该笔交易自己的时间，格式 YYYY-MM-DD HH:mm:ss；缺少年或时间时返回 null，绝不能使用当前时间补齐。
6. 每个元素 direction 固定为 expense。
7. category_guess 只能是 food、transport、shopping、housing、entertainment、medical、education、social、transfer、other 或 null。
8. 商户、人名、支付方式看不清就返回 null；不要臆测。信息不完整时降低该元素 confidence，并在 notes 简短说明。
9. source 只能是 wechat_pay、alipay、bank、receipt、unknown。
10. 图片中没有可靠支出时返回空 expenses 数组，不得编造交易。

严格按以下批量字段和类型返回：
${JSON.stringify(RECEIPT_BATCH_OUTPUT_EXAMPLE)}`;
}

/**
 * 【做什么】统一读取 OpenAI 兼容响应中的文本内容。
 * 【何时调用】百炼返回成功响应后；兼容字符串和内容片段两种格式。
 */
function getTextContent(payload: QwenResponse): string {
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content.map((item) => item.text ?? "").join("");
  }
  throw new Error("识别服务没有返回内容");
}
