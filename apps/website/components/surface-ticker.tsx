import { PRISM_TOOL_COUNT } from "@/lib/mcp-install";

const ITEMS = [
  "CLI",
  "VS Code & Cursor",
  `MCP ${PRISM_TOOL_COUNT} tools`,
  "Plugin pack",
  "Core SDK",
  "Playground",
  "Dispatch Console",
  "Iris",
  "Spectrum",
] as const;

/** One shrink-wrapped pass of the surface names. Two of these make the loop. */
function Loop({ copy }: { copy: string }) {
  return (
    <span className="surface-ticker__loop">
      {ITEMS.map((item) => (
        <span key={`${copy}-${item}`} className="surface-ticker__pair">
          <span className="surface-ticker__item">{item}</span>
          <span className="surface-ticker__dot">·</span>
        </span>
      ))}
      {ITEMS.map((item) => (
        <span key={`${copy}-2-${item}`} className="surface-ticker__pair">
          <span className="surface-ticker__item">{item}</span>
          <span className="surface-ticker__dot">·</span>
        </span>
      ))}
    </span>
  );
}

/** Full-bleed marquee of product surfaces. Decorative — copy lives in sections. */
export function SurfaceTicker() {
  return (
    <div className="surface-ticker" aria-hidden>
      <div className="surface-ticker__end surface-ticker__end--start">
        <span className="surface-ticker__dots">
          <i />
          <i />
          <i />
          <i />
        </span>
      </div>
      <div className="surface-ticker__track">
        <Loop copy="a" />
        <Loop copy="b" />
      </div>
      <div className="surface-ticker__end surface-ticker__end--end">
        <span className="surface-ticker__dots">
          <i />
          <i />
          <i />
          <i />
        </span>
      </div>
    </div>
  );
}
