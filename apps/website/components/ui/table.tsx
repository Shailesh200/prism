import type { ComponentProps } from "react";
import { cx } from "./cx";

/** Also the MDX `table`. Scrolls sideways on its own when it is wider than the screen. */
export function Table({ className, ...rest }: ComponentProps<"table">) {
  return (
    <div className="tscroll">
      <table className={cx("t", className)} {...rest} />
    </div>
  );
}
