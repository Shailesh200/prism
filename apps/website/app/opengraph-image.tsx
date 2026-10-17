import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "Prism: know before you ship";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Prompt mark (ink on paper), inlined so the route needs no file read. */
const MARK = `data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0OCA0OCI+PHBhdGggZD0iTTQgOSBIMTIuNSBMMjUgMjQgTDEyLjUgMzkgSDQgTDE2LjUgMjRaIiBmaWxsPSIjMUExOTE1Ii8+PHBhdGggZD0iTTI3IDM5IEwzNS41IDI0LjMgTDQ0IDM5WiIgZmlsbD0iIzBGNzY2RSIvPjwvc3ZnPg==`;

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
          background: "#f4f1ea",
          color: "#1a1915",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
            fontSize: 72,
            fontWeight: 700,
            color: "#0f766e",
          }}
        >
          {/* oxlint-disable-next-line nextjs/no-img-element -- ImageResponse renders a plain img */}
          <img src={MARK} width={88} height={88} alt="" />
          Prism
        </div>
        <div style={{ fontSize: 32, marginTop: 24, maxWidth: 860 }}>
          Know before you ship. When Claude Code stops, Prism runs your checks
          on what changed and gives one verdict. Free, MIT, runs on your
          machine.
        </div>
      </div>
    ),
    { ...size },
  );
}
