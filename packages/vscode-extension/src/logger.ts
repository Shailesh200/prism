import type { OutputChannel, window as VsWindow } from "vscode";

export type PrismLogger = {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  show(): void;
  dispose(): void;
};

export function createLogger(win: typeof VsWindow): PrismLogger {
  const channel: OutputChannel = win.createOutputChannel("Prism");
  return {
    info(message) {
      channel.appendLine(`[info] ${message}`);
    },
    warn(message) {
      channel.appendLine(`[warn] ${message}`);
    },
    error(message) {
      channel.appendLine(`[error] ${message}`);
    },
    show() {
      channel.show(true);
    },
    dispose() {
      channel.dispose();
    },
  };
}
