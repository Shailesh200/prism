import Link from "next/link";
import type { ComponentProps } from "react";
import { cx } from "./cx";

type Variant = "dark" | "line" | "star";

const CLASS: Record<Variant, string> = {
  dark: "dark",
  line: "line",
  star: "star",
};

type ButtonProps = Omit<ComponentProps<"a">, "href"> & {
  href: string;
  variant?: Variant;
  size?: "sm";
};

export function Button({
  href,
  variant = "dark",
  size,
  className,
  ...rest
}: ButtonProps) {
  const cls = cx("btn", CLASS[variant], size, className);
  if (/^https?:/.test(href)) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className={cls}
        {...rest}
      />
    );
  }
  // Other schemes (cursor://) open an app, not a page.
  if (/^[a-z][a-z0-9+.-]*:/i.test(href))
    return <a href={href} className={cls} {...rest} />;
  return <Link href={href} className={cls} {...rest} />;
}
