import type { ReactNode } from "react";
import { Button } from "./button";
import { StarButton } from "./star-button";
import { Command } from "./command";
import { Container } from "./container";

export const INSTALL_COMMAND =
  "npm install -g @repo-prism/cli && prism install all";

export function CtaBand({
  title = "Try it in your repo.",
  lede = "Install Prism, then connect every agent on this machine. Open the agent again.",
  cmd = INSTALL_COMMAND,
  actions,
}: {
  title?: ReactNode;
  lede?: string;
  cmd?: string;
  /** Replaces the default Install guide + Star buttons. */
  actions?: ReactNode;
}) {
  return (
    <section className="sec cta">
      <Container>
        <h2 className="d2">{title}</h2>
        <p className="lede">{lede}</p>
        <div className="cmdw">
          <Command cmd={cmd} />
        </div>
        <div className="acts">
          {actions ?? (
            <>
              <Button href="/install">Install guide</Button>
              <StarButton />
            </>
          )}
        </div>
      </Container>
    </section>
  );
}
