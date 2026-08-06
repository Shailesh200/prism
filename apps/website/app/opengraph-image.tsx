import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "Prism";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 80,
          background: "#0a0e1a",
          color: "#e8eef2",
        }}
      >
        <div style={{ fontSize: 72, fontWeight: 700, color: "#00c2c2" }}>
          Prism
        </div>
        <div style={{ fontSize: 32, marginTop: 24, maxWidth: 800 }}>
          Local-first software intelligence for your repository
        </div>
      </div>
    ),
    { ...size },
  );
}
