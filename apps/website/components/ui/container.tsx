import type { ComponentProps } from "react";
import { cx } from "./cx";

export function Container({ className, ...rest }: ComponentProps<"div">) {
  return <div className={cx("wrap", className)} {...rest} />;
}
