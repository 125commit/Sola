import { ImageResponse } from "next/og";

/**
 * 【做什么】用与 PNG 标志相同的配色生成方形应用图标。
 * 【何时调用】Next.js 请求 favicon 或 Apple 触控图标时。
 */
export function createAppIconResponse(size: number): ImageResponse {
  const radius = Math.round(size * 0.22);
  const paper = Math.round(size * 0.46);
  const paperRadius = Math.round(size * 0.06);
  const badge = Math.round(size * 0.24);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#12261f",
          borderRadius: radius,
          position: "relative",
        }}
      >
        <div
          style={{
            display: "flex",
            width: paper,
            height: paper,
            background: "#f6f2e8",
            borderRadius: paperRadius,
            marginRight: Math.round(size * 0.08),
            marginBottom: Math.round(size * 0.08),
          }}
        />
        <div
          style={{
            position: "absolute",
            right: Math.round(size * 0.16),
            bottom: Math.round(size * 0.16),
            width: badge,
            height: badge,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#f4b942",
            borderRadius: 999,
            color: "#12261f",
            fontSize: Math.round(size * 0.16),
            fontWeight: 700,
          }}
        >
          +
        </div>
      </div>
    ),
    { width: size, height: size },
  );
}
