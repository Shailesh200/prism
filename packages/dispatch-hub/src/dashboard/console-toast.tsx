import { useEffect, useState, type ReactElement } from "react";
import { createPortal } from "react-dom";

/**
 * Broadcast rather than a module singleton: Bun's dashboard bundle can
 * duplicate this file, so a `let push` in Settings would not be the same
 * binding the host writes.
 */
export const CONSOLE_TOAST_EVENT = "prism-console-toast";

export function showConsoleToast(message: string): void {
  window.dispatchEvent(
    new CustomEvent(CONSOLE_TOAST_EVENT, { detail: message }),
  );
}

export function ConsoleToastHost(): ReactElement | null {
  const [message, setMessage] = useState<string | undefined>();

  useEffect(() => {
    const onToast = (event: Event): void => {
      const detail = (event as CustomEvent<string>).detail;
      if (typeof detail === "string" && detail.length > 0) {
        setMessage(detail);
      }
    };
    window.addEventListener(CONSOLE_TOAST_EVENT, onToast);
    return () => window.removeEventListener(CONSOLE_TOAST_EVENT, onToast);
  }, []);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(undefined), 3200);
    return () => window.clearTimeout(timer);
  }, [message]);

  if (!message) return null;
  return createPortal(
    <p className="console-toast" role="status">
      {message}
    </p>,
    document.body,
  );
}
