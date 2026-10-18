import { Fragment } from "react";
import { CopyButton } from "./copy";

export function Command({ cmd, hint }: { cmd: string; hint?: string }) {
  return (
    <div className="cmd">
      <span className="p">$</span>
      <span>
        {cmd.split(" && ").map((part, i) => (
          <Fragment key={part}>
            {i > 0 && " "}
            <span className="seg">
              {i > 0 && "&& "}
              {part}
            </span>
          </Fragment>
        ))}
      </span>
      {hint && <small>{hint}</small>}
      <CopyButton text={cmd} />
    </div>
  );
}
