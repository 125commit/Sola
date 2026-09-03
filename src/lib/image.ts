export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const SUPPORTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/**
 * 【做什么】在上传前校验截图格式和体积。
 * 【何时调用】用户选择图片后和服务端接收图片后，防止无效文件进入模型请求。
 */
export function validateReceiptImage(file: File): string | null {
  if (!SUPPORTED_IMAGE_TYPES.includes(file.type as (typeof SUPPORTED_IMAGE_TYPES)[number])) {
    return "仅支持 PNG、JPG 或 WebP 图片";
  }
  if (file.size === 0) {
    return "图片内容为空";
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return "图片不能超过 8 MB";
  }
  return null;
}

/**
 * 【做什么】计算截图内容的不可逆 SHA-256 指纹。
 * 【何时调用】上传识别前，用于提醒同一张图片已经记过账。
 */
export async function hashImageFile(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
