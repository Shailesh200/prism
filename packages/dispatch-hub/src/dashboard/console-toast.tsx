import {
  PrismToastHost,
  showPrismToast,
  type PrismToastTone,
} from "@repo-prism/ui";

/**
 * Broadcast rather than a module singleton: Bun's dashboard bundle can
 * duplicate this file, so a `let push` in Settings would not be the same
 * binding the host writes.
 */
export const CONSOLE_TOAST_EVENT = "prism-toast";

export type ConsoleToastTone = PrismToastTone;

export type ConsoleToastDetail = {
  readonly message: string;
  readonly tone: ConsoleToastTone;
};

export function showConsoleToast(
  message: string,
  tone: ConsoleToastTone = "ok",
): void {
  showPrismToast(message, tone);
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

export { PrismToastHost as ConsoleToastHost };
