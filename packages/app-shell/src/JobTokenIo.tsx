import { ArrowDown, ArrowUp } from "lucide-react";
import type { ReactElement } from "react";
import { jobUsageFigures, type JobTokenUsage } from "./jobs-types.js";

type JobTokenIoProps = {
  readonly usage: JobTokenUsage | undefined;
  readonly className?: string;
};

/**
 * Billed in/out as arrows — up/green in, down/orange out.
 * Used in the Focus inspector, not on Pulse cards.
 */
export function JobTokenIo(props: JobTokenIoProps): ReactElement | null {
  const figures = jobUsageFigures(props.usage);
  const billed = figures.input !== "—" || figures.output !== "—";
  if (!billed) {
    return <>—</>;
  }
  const className = ["job-token-io", props.className].filter(Boolean).join(" ");
  return (
    <span
      className={className}
      aria-label={`In ${figures.input}, out ${figures.output}`}
    >
      <span className="job-token-io__in">
        <ArrowUp size={12} strokeWidth={2.4} aria-hidden />
        {figures.input}
      </span>
      <span className="job-token-io__out">
        <ArrowDown size={12} strokeWidth={2.4} aria-hidden />
        {figures.output}
      </span>
    </span>
  );
}
