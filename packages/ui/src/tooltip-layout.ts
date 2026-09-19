/** Tightest width that still fits wrapped tooltip lines, capped by max-width. */
export function tooltipHugWidth(
  lineWidths: readonly number[],
  chrome: number,
  maxWidth: number,
): number {
  const content = lineWidths.reduce(
    (widest, width) => Math.max(widest, width),
    0,
  );
  const next = Math.ceil(content + chrome);
  if (!Number.isFinite(maxWidth) || maxWidth <= 0) return next;
  return Math.min(next, Math.floor(maxWidth));
}

function clientRectWidths(range: Range): number[] {
  try {
    const rects = range.getClientRects();
    if (!rects || typeof rects.length !== "number") return [];
    return Array.from(rects, (rect) => rect.width);
  } catch {
    return [];
  }
}

function lineWidthsIn(node: Node): number[] {
  const widths: number[] = [];
  if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
    const range = document.createRange();
    range.selectNodeContents(node);
    const lineWidths = clientRectWidths(range);
    if (lineWidths.length > 0) widths.push(...lineWidths);
    else if (node.parentElement) {
      widths.push(node.parentElement.getBoundingClientRect().width);
    }
  }
  for (const child of node.childNodes) {
    widths.push(...lineWidthsIn(child));
  }
  return widths;
}

/** Shrink a laid-out tooltip to its widest text line. No min-width. */
export function hugTooltipPopWidth(pop: HTMLElement): number {
  pop.style.width = "";
  const style = getComputedStyle(pop);
  const maxWidth = parseFloat(style.maxWidth);
  const chrome =
    parseFloat(style.paddingLeft) +
    parseFloat(style.paddingRight) +
    parseFloat(style.borderLeftWidth) +
    parseFloat(style.borderRightWidth);
  const next = tooltipHugWidth(lineWidthsIn(pop), chrome, maxWidth);
  pop.style.width = `${next}px`;
  return next;
}
