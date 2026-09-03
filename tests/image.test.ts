import { describe, expect, it } from "vitest";

import { MAX_SOURCE_IMAGE_BYTES, MAX_UPLOAD_IMAGE_BYTES, validateReceiptImage } from "@/lib/image";

/**
 * 【做什么】构造指定体积的假图片，避免测试依赖真实截图文件。
 * 【何时调用】校验体积和格式分支时。
 */
function makeFile(bytes: number, type = "image/jpeg", name = "shot.jpg"): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

describe("validateReceiptImage", () => {
  it("拒绝不支持的格式", () => {
    expect(validateReceiptImage(makeFile(100, "image/gif", "shot.gif"))).toMatch(/仅支持/);
  });

  it("手机相册空 MIME 但扩展名是图片时放行", () => {
    expect(validateReceiptImage(makeFile(100, "", "IMG_0001.PNG"))).toBeNull();
  });

  it("服务端默认按 Vercel 安全上限拒绝过大文件", () => {
    expect(validateReceiptImage(makeFile(MAX_UPLOAD_IMAGE_BYTES + 1))).toMatch(/不能超过 3\.5 MB/);
  });

  it("选图阶段允许超过上传上限、但仍拒绝超大原图", () => {
    expect(validateReceiptImage(makeFile(MAX_UPLOAD_IMAGE_BYTES + 1, "image/jpeg"), MAX_SOURCE_IMAGE_BYTES)).toBeNull();
    expect(validateReceiptImage(makeFile(MAX_SOURCE_IMAGE_BYTES + 1, "image/jpeg"), MAX_SOURCE_IMAGE_BYTES)).toMatch(
      /不能超过 12 MB/,
    );
  });
});
