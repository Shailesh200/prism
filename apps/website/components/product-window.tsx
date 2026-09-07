import Image from "next/image";
import type { ReactNode } from "react";

type ProductWindowProps = {
  brand: string;
  product: string;
  meta: string;
  children: ReactNode;
  trailing?: ReactNode;
};

/** Shared product chrome for landing theaters. Matches Console / Playground bars. */
export function ProductWindow({
  brand,
  product,
  meta,
  children,
  trailing,
}: ProductWindowProps) {
  return (
    <div className="lt-window">
      <div className="lt-window__bar">
        <div className="lt-window__brand">
          <Image
            className="lt-window__mark"
            src="/brand/prism-mark.png"
            width={16}
            height={16}
            alt=""
          />
          <p className="lt-window__word">
            {brand}
            <span>{product}</span>
          </p>
        </div>
        {trailing}
        <p className="lt-window__meta">{meta}</p>
      </div>
      {children}
    </div>
  );
}
