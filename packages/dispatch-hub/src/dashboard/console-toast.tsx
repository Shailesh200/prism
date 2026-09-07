import { CheckCircle2, CircleAlert } from "lucide-react";
import { useEffect, useState, type ReactElement } from "react";
import { createPortal } from "react-dom";

/**
 * Broadcast rather than a module singleton: Bun's dashboard bundle can
 * duplicate this file, so a `let push` in Settings would not be the same
 * binding the host writes.
 */
export const CONSOLE_TOAST_EVENT = "prism-console-toast";

export type ConsoleToastTone = "ok" | "error";

export type ConsoleToastDetail = {
  readonly message: string;
  readonly tone: ConsoleToastTone;
};

export function showConsoleToast(
  message: string,
  tone: ConsoleToastTone = "ok",
): void {
  const detail: ConsoleToastDetail = { message, tone };
  window.dispatchEvent(new CustomEvent(CONSOLE_TOAST_EVENT, { detail }));
}

export function controlFinishToast(
  action: "retry" | "reverify",
  options: {
    readonly title?: string;
    readonly verification?: "passed" | "failed" | "skipped";
  } = {},
): ConsoleToastDetail {
  if (action === "retry") {
    const title = options.title?.trim();
    return {
      message: title ? `Retrying ${title}` : "Retry started",
      tone: "ok",
    };
  }
  if (options.verification === "passed") {
    return { message: "Verification passed", tone: "ok" };
  }
  if (options.verification === "failed") {
    return { message: "Verification failed", tone: "error" };
  }
  return { message: "Verification finished", tone: "ok" };
}

export function ConsoleToastHost(): ReactElement | null {
  const [toast, setToast] = useState<ConsoleToastDetail | undefined>();

  useEffect(() => {
    const onToast = (event: Event): void => {
      const detail = (event as CustomEvent<ConsoleToastDetail>).detail;
      if (
        detail &&
        typeof detail.message === "string" &&
        detail.message.length > 0
      ) {
        setToast({
          message: detail.message,
          tone: detail.tone === "error" ? "error" : "ok",
        });
      }
    };
    window.addEventListener(CONSOLE_TOAST_EVENT, onToast);
    return () => window.removeEventListener(CONSOLE_TOAST_EVENT, onToast);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(undefined), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  if (!toast) return null;
  const Icon = toast.tone === "error" ? CircleAlert : CheckCircle2;
  return createPortal(
    <p
      className={
        toast.tone === "error"
          ? "console-toast console-toast--error"
          : "console-toast"
      }
      role="status"
    >
      <Icon size={16} aria-hidden />
      {toast.message}
    </p>,
    document.body,
  );
}
