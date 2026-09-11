import { AlertTriangle, CheckCircle2, CircleAlert, Info } from "lucide-react";
import { useEffect, useState, type ReactElement } from "react";
import { createPortal } from "react-dom";

export const PRISM_TOAST_EVENT = "prism-toast";

export type PrismToastTone = "ok" | "error" | "info" | "warning";

export type PrismToastDetail = {
  readonly message: string;
  readonly tone: PrismToastTone;
};

export function showPrismToast(
  message: string,
  tone: PrismToastTone = "ok",
): void {
  const detail: PrismToastDetail = { message, tone };
  window.dispatchEvent(new CustomEvent(PRISM_TOAST_EVENT, { detail }));
}

function toastIcon(tone: PrismToastTone) {
  switch (tone) {
    case "error":
      return CircleAlert;
    case "warning":
      return AlertTriangle;
    case "info":
      return Info;
    default:
      return CheckCircle2;
  }
}

export function PrismToastHost(): ReactElement | null {
  const [toast, setToast] = useState<PrismToastDetail | undefined>();

  useEffect(() => {
    const onToast = (event: Event): void => {
      const detail = (event as CustomEvent<PrismToastDetail>).detail;
      if (
        detail &&
        typeof detail.message === "string" &&
        detail.message.length > 0
      ) {
        setToast({
          message: detail.message,
          tone: detail.tone ?? "ok",
        });
      }
    };
    window.addEventListener(PRISM_TOAST_EVENT, onToast);
    return () => window.removeEventListener(PRISM_TOAST_EVENT, onToast);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(undefined), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  if (!toast) return null;
  const Icon = toastIcon(toast.tone);
  return createPortal(
    <p className={`prism-toast prism-toast--${toast.tone}`} role="status">
      <Icon size={16} aria-hidden />
      {toast.message}
    </p>,
    document.body,
  );
}
