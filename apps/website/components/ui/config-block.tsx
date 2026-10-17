import type { ReactNode } from "react";
import { CopyButton } from "./copy";

/** `text` is what Copy puts on the clipboard; `children` is an optional highlighted version (`.k` keys, `.s` strings). */
export function ConfigBlock({
  lang,
  path,
  text,
  children,
  footer,
}: {
  lang: string;
  path: string;
  text: string;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="cfg">
      <div className="cfg-h">
        <span className="lang">{lang}</span>
        <span className="path">{path}</span>
        <CopyButton text={text} label="Copy" />
      </div>
      <pre>{children ?? text}</pre>
      {footer && <div className="cfg-f">{footer}</div>}
    </div>
  );
}
