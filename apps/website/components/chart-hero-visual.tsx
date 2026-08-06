/** Decorative repository chart — SVG map plane for the landing hero. */
export function ChartHeroVisual() {
  return (
    <div
      aria-hidden
      className="relative h-full min-h-[280px] w-full overflow-hidden rounded-none md:min-h-[420px]"
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,color-mix(in_oklab,var(--prism-brand)_22%,transparent),transparent_55%),radial-gradient(ellipse_at_80%_60%,color-mix(in_oklab,var(--prism-accent)_16%,transparent),transparent_50%),var(--prism-canvas)]" />
      <div
        className="absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage: `
            linear-gradient(to right, var(--prism-line) 1px, transparent 1px),
            linear-gradient(to bottom, var(--prism-line) 1px, transparent 1px)
          `,
          backgroundSize: "48px 48px",
        }}
      />
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 800 480"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M120 320 C200 260, 280 280, 360 220 S520 140, 640 180"
          stroke="var(--prism-brand)"
          strokeWidth="2"
          strokeOpacity="0.55"
        />
        <path
          d="M160 380 C260 340, 300 300, 420 300 S580 340, 700 280"
          stroke="var(--prism-accent)"
          strokeWidth="1.5"
          strokeOpacity="0.4"
        />
        <circle
          cx="360"
          cy="220"
          r="44"
          fill="color-mix(in oklab, var(--prism-brand) 18%, transparent)"
          stroke="var(--prism-brand)"
        />
        <circle
          cx="520"
          cy="160"
          r="28"
          fill="color-mix(in oklab, var(--prism-accent) 20%, transparent)"
          stroke="var(--prism-accent)"
        />
        <circle
          cx="240"
          cy="300"
          r="22"
          fill="color-mix(in oklab, var(--prism-brand) 14%, transparent)"
          stroke="var(--prism-brand)"
          strokeOpacity="0.7"
        />
        <circle
          cx="640"
          cy="180"
          r="18"
          fill="color-mix(in oklab, var(--prism-brand) 20%, transparent)"
          stroke="var(--prism-brand)"
        />
        <circle
          cx="420"
          cy="300"
          r="34"
          fill="color-mix(in oklab, #f59e0b 16%, transparent)"
          stroke="#f59e0b"
          strokeOpacity="0.8"
        />
        <text
          x="340"
          y="224"
          fill="var(--color-fd-foreground)"
          fontSize="12"
          fontFamily="var(--font-mono), monospace"
        >
          core
        </text>
        <text
          x="498"
          y="164"
          fill="var(--color-fd-foreground)"
          fontSize="11"
          fontFamily="var(--font-mono), monospace"
        >
          cli
        </text>
        <text
          x="398"
          y="304"
          fill="var(--color-fd-foreground)"
          fontSize="11"
          fontFamily="var(--font-mono), monospace"
        >
          blast
        </text>
        {/* Contour rings */}
        <ellipse
          cx="420"
          cy="300"
          rx="70"
          ry="48"
          stroke="#f59e0b"
          strokeOpacity="0.25"
        />
        <ellipse
          cx="420"
          cy="300"
          rx="100"
          ry="68"
          stroke="#f59e0b"
          strokeOpacity="0.12"
        />
      </svg>
      <div className="absolute bottom-4 left-4 rounded-md border border-fd-border bg-fd-card/90 px-3 py-1.5 font-mono text-xs text-fd-muted-foreground backdrop-blur">
        repository map · local index
      </div>
    </div>
  );
}
