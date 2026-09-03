import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 职责：把现有 SVG 标志栅格化成 PWA / iOS 需要的 PNG。
 * 原因：Chrome 安装条件要求 192/512 PNG；iOS 主屏幕图标不接受 SVG。
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function crc32(buffer) {
  let crc = ~0;
  for (let index = 0; index < buffer.length; index += 1) {
    crc ^= buffer[index];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

function encodePng(width, height, pixels) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const destination = y * (width * 4 + 1);
    raw[destination] = 0;
    Buffer.from(pixels.buffer, pixels.byteOffset + y * width * 4, width * 4).copy(
      raw,
      destination + 1,
    );
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function inRoundRect(px, py, x, y, width, height, radius) {
  if (px < x || py < y || px > x + width || py > y + height) {
    return false;
  }
  const corner = Math.min(radius, width / 2, height / 2);
  const insideX = px >= x + corner && px <= x + width - corner;
  const insideY = py >= y + corner && py <= y + height - corner;
  if (insideX || insideY) {
    return true;
  }
  const cx = px < x + corner ? x + corner : x + width - corner;
  const cy = py < y + corner ? y + corner : y + height - corner;
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= corner * corner;
}

function inCircle(px, py, cx, cy, radius) {
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= radius * radius;
}

function distanceToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = dx * dx + dy * dy;
  const progress =
    length === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / length));
  return Math.hypot(px - (x1 + progress * dx), py - (y1 + progress * dy));
}

function mix(base, overlay) {
  const alpha = overlay[3] / 255;
  if (alpha <= 0) {
    return base;
  }
  return [
    Math.round(overlay[0] * alpha + base[0] * (1 - alpha)),
    Math.round(overlay[1] * alpha + base[1] * (1 - alpha)),
    Math.round(overlay[2] * alpha + base[2] * (1 - alpha)),
    255,
  ];
}

function paintIcon(size) {
  const pixels = new Uint8Array(size * size * 4);
  const scale = size / 512;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const px = (x + 0.5) / scale;
      const py = (y + 0.5) / scale;
      let color = [0, 0, 0, 0];

      if (inRoundRect(px, py, 0, 0, 512, 512, 112)) {
        color = [18, 38, 31, 255];
      }
      if (inRoundRect(px, py, 142, 141, 228, 230, 28)) {
        color = mix(color, [246, 242, 232, 255]);
      }
      if (distanceToSegment(px, py, 184, 194, 328, 194) <= 12.5) {
        color = mix(color, [18, 38, 31, 255]);
      }
      if (distanceToSegment(px, py, 184, 250, 328, 250) <= 12.5) {
        color = mix(color, [18, 38, 31, 255]);
      }
      if (distanceToSegment(px, py, 184, 306, 272, 306) <= 12.5) {
        color = mix(color, [18, 38, 31, 255]);
      }
      if (inCircle(px, py, 336, 330, 59)) {
        color = mix(color, [244, 185, 66, 255]);
      }
      if (distanceToSegment(px, py, 336, 296, 336, 364) <= 9) {
        color = mix(color, [18, 38, 31, 255]);
      }
      if (distanceToSegment(px, py, 302, 330, 370, 330) <= 9) {
        color = mix(color, [18, 38, 31, 255]);
      }

      const offset = (y * size + x) * 4;
      pixels[offset] = color[0];
      pixels[offset + 1] = color[1];
      pixels[offset + 2] = color[2];
      pixels[offset + 3] = color[3];
    }
  }

  return pixels;
}

const outputs = [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["apple-touch-icon.png", 180],
];

for (const [fileName, size] of outputs) {
  writeFileSync(join(ROOT, "public", fileName), encodePng(size, size, paintIcon(size)));
  console.log(`wrote public/${fileName}`);
}
