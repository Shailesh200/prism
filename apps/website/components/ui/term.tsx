import type { CSSProperties, ReactNode } from "react";

/** One terminal line inside a `Window`. */
export function Ln({ children }: { children?: ReactNode }) {
  return <span className="ln">{children}</span>;
}

/** A typed command: the `$` prompt, then the command. As the first row of a pair window it types itself. */
/** Commands longer than this wrap instead of typing on one clipped line. */
const TYPE_MAX = 56;

export function Typed({ cmd }: { cmd: string }) {
  if (cmd.length > TYPE_MAX) {
    return (
      <Ln>
        <span className="d">$ </span>
        {cmd}
      </Ln>
    );
  }
  const steps = {
    "--n": cmd.length,
    "--w": `${cmd.length}ch`,
  } as CSSProperties;
  return (
    <Ln>
      <span className="d">$ </span>
      <span className="typed" style={steps}>
        {cmd}
      </span>
    </Ln>
  );
}

/** Column layout of the real CLI: the table pads each column to its widest cell, with a 2-space gap. */
export const cells = (width: number, a: string, b: string) =>
  `${a.padEnd(width)}  ${b}`;

/** The header block of `prism prepare`. */
export function PrepareFields({
  files,
  tests,
  reuse,
}: {
  files: number;
  tests: number;
  reuse: number;
}) {
  const fields = [
    ["Files", files],
    ["Tests", tests],
    ["Reuse", reuse],
    ["Truncated", "no"],
  ] as const;
  return (
    <>
      {fields.map(([name, value]) => (
        <Ln key={name}>
          <span className="d">{name.padEnd(9)}</span>
          {`  ${value}`}
        </Ln>
      ))}
    </>
  );
}

/** A receipt row: the label is padded to 15, then one space. Non-breaking, so chat bubbles keep the gap too. */
export function ReceiptRow({
  k,
  tone,
  children,
}: {
  k: string;
  tone: "d" | "r" | "y";
  children: ReactNode;
}) {
  return (
    <>
      <span className={tone}>{k}</span>
      {" ".repeat(16 - k.length)}
      {children}
    </>
  );
}

export const Proven = () => (
  <ReceiptRow k="Proven" tone="d">
    2 scoped test files · typecheck <span className="g">✓</span>
  </ReceiptRow>
);

export const Failed = () => (
  <ReceiptRow k="Failed" tone="r">
    test <span className="r">✗</span> Failed Tests 1
  </ReceiptRow>
);
