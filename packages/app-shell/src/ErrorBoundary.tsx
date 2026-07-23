import { Component, type ErrorInfo, type ReactNode } from "react";

export type PrismErrorBoundaryProps = {
  readonly children: ReactNode;
  /** Short label shown in the fallback (e.g. "Blast Radius", "Prism"). */
  readonly label?: string;
  /** Optional reset key — changing it remounts children after a failure. */
  readonly resetKey?: string | number;
  /** Optional custom fallback. */
  readonly fallback?: ReactNode;
  /** Called when an error is caught (for logging). */
  readonly onError?: (error: Error, info: ErrorInfo) => void;
};

type State = {
  readonly error: Error | null;
};

/**
 * Catch render errors so a single screen can't blank the whole shell.
 * Use at the app root and around each tab/view body.
 */
export class PrismErrorBoundary extends Component<
  PrismErrorBoundaryProps,
  State
> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, info);
    // Keep a console trail for extension host / playground debugging.
    console.error(
      `[PrismErrorBoundary${this.props.label ? `:${this.props.label}` : ""}]`,
      error,
      info.componentStack,
    );
  }

  override componentDidUpdate(prevProps: PrismErrorBoundaryProps): void {
    if (
      this.state.error &&
      prevProps.resetKey !== this.props.resetKey &&
      this.props.resetKey !== undefined
    ) {
      this.setState({ error: null });
    }
  }

  private retry = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    const label = this.props.label ?? "This view";
    return (
      <div className="prism-error-boundary" role="alert">
        <div className="prism-error-boundary__card">
          <h2 className="prism-error-boundary__title">
            {label} failed to render
          </h2>
          <p className="prism-error-boundary__msg">
            {error.message || "An unexpected error occurred."}
          </p>
          <div className="prism-error-boundary__actions">
            <button
              type="button"
              className="ov-btn ov-btn--primary"
              onClick={this.retry}
            >
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }
}
