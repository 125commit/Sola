export const SUPPORTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const HEIC_IMAGE_TYPES = ["image/heic", "image/heif"] as const;
const NAME_HINT = /\.(png|jpe?g|webp|heic|heif)$/i;

/**
 * 【做什么】判断文件是否像一张可识别的账单图。
 * 【何时调用】选图校验时；手机相册经常给出空 MIME，只能看扩展名。
 */
function isSupportedReceiptType(file: File): boolean {
  if ((SUPPORTED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return true;
  }
  if ((HEIC_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return true;
  }
  // Android 相册有时 type 为空或 octet-stream，只要文件名仍是图片就放行，交给压缩阶段解码。
  return (!file.type || file.type === "application/octet-stream") && NAME_HINT.test(file.name);
}

/**
 * 相册原图可选上限（字节）。选完后会再压缩，因此允许比上传上限更大。
 * NOTE: 12 MB 覆盖常见手机截图；再大则多半不是账单图，直接拒绝以免解码把内存打满。
 */
export const MAX_SOURCE_IMAGE_BYTES = 12 * 1024 * 1024;

/**
 * 发给识别接口的文件上限（字节）。
 * NOTE: Vercel 函数请求体硬限制 4.5 MB，这里留出 multipart 表单开销。
 */
export const MAX_UPLOAD_IMAGE_BYTES = Math.floor(3.5 * 1024 * 1024);

/** 识别不需要 4K 像素；压最长边可同时减小体积和模型耗时。 */
export const MAX_RECEIPT_EDGE_PX = 1600;

const JPEG_QUALITIES = [0.82, 0.7, 0.58, 0.45];

function formatMegabytes(bytes: number): string {
  return String(Math.round((bytes / (1024 * 1024)) * 10) / 10);
}

/**
 * 【做什么】校验截图格式和体积。
 * 【何时调用】用户选图后（按原图上限）以及服务端收到上传文件后（按 Vercel 安全上限）。
 */
export function validateReceiptImage(
  file: File,
  maxBytes: number = MAX_UPLOAD_IMAGE_BYTES,
): string | null {
  if (!isSupportedReceiptType(file)) {
    return "仅支持 PNG、JPG、WebP 或手机相册图片";
  }
  if (file.size === 0) {
    return "图片内容为空";
  }
  if (file.size > maxBytes) {
    return `图片不能超过 ${formatMegabytes(maxBytes)} MB`;
  }
  return null;
}

/**
 * 【做什么】计算截图内容的不可逆 SHA-256 指纹。
 * 【何时调用】上传识别前，用于提醒同一张图片已经记过账。
 * 【原因】必须对用户选出的原图哈希；压缩后的 JPEG 每次像素会略有差别，不能当去重键。
 */
export async function hashImageFile(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function replaceExtension(fileName: string, extension: string): string {
  const base = fileName.replace(/\.[^.]+$/, "").trim() || "receipt";
  return `${base}.${extension}`;
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("图片编码失败，请换一张截图或手动填写"));
          return;
        }
        resolve(blob);
      },
      "image/jpeg",
      quality,
    );
  });
}

async function decodeImageBitmap(file: File): Promise<ImageBitmap> {
  try {
    // LEARN: imageOrientation 让带 EXIF 旋转的照片按视觉方向解码，避免账单字被横过来。
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return await createImageBitmap(file);
  }
}

/**
 * 【做什么】把相册原图压到可安全发给 Vercel 识别接口的 JPEG。
 * 【何时调用】选图校验通过之后、POST /api/receipts/parse 之前（仅浏览器）。
 * 【副作用】只产生内存中的新 File，不写磁盘；原图仅用于预览和哈希。
 */
export async function compressReceiptImageForUpload(file: File): Promise<File> {
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") {
    // WARN: 极旧浏览器没有 Canvas 解码时，只能原样上传；超过上限就请用户换图。
    if (file.size <= MAX_UPLOAD_IMAGE_BYTES) {
      return file;
    }
    throw new Error("当前浏览器无法压缩这张图，请换一张更小的截图或手动填写");
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await decodeImageBitmap(file);
  } catch {
    if (file.size <= MAX_UPLOAD_IMAGE_BYTES) {
      return file;
    }
    throw new Error("无法读取这张图片，请换一张截图或手动填写");
  }

  try {
    const scale = Math.min(1, MAX_RECEIPT_EDGE_PX / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      if (file.size <= MAX_UPLOAD_IMAGE_BYTES) {
        return file;
      }
      throw new Error("无法处理这张图片，请换一张截图或手动填写");
    }

    context.drawImage(bitmap, 0, 0, width, height);

    for (const quality of JPEG_QUALITIES) {
      const blob = await canvasToJpeg(canvas, quality);
      if (blob.size > MAX_UPLOAD_IMAGE_BYTES) {
        continue;
      }

      // NOTE: 原图已经够小且再编码反而变大时，沿用原文件，避免无意义的画质损失。
      if (scale === 1 && file.size <= MAX_UPLOAD_IMAGE_BYTES && blob.size >= file.size) {
        return file;
      }

      return new File([blob], replaceExtension(file.name, "jpg"), {
        type: "image/jpeg",
        lastModified: file.lastModified,
      });
    }

    throw new Error("压缩后仍超过上传上限，请裁剪截图后重试或手动填写");
  } finally {
    bitmap.close();
  }
}
