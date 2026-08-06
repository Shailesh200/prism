export function Sparkline({
  values,
  className = "",
}: {
  values: number[];
  className?: string;
}) {
  if (values.length < 2) {
    return (
      <div
        className={`h-8 w-full rounded bg-fd-muted/40 ${className}`}
        aria-hidden
      />
    );
  }
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = Math.max(max - min, 1);
  const w = 120;
  const h = 32;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / span) * (h - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={`h-8 w-full text-fd-primary ${className}`}
      aria-hidden
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        points={points}
      />
    </svg>
  );
}
