/**
 * Host-aware connect UX (ADR-0037).
 *
 * The grant still finishes on Prism Auth and the token still lands in the OS
 * keychain. What changes is how the human starts that grant: Cursor's native
 * Authenticate control, Claude opening the page, progress steps either way.
 */

export const CONNECT_STEP_IDS = [
  "confirm",
  "prepare",
  "authenticate",
  "store",
  "done",
] as const;

export type ConnectStepId = (typeof CONNECT_STEP_IDS)[number];

export type ConnectStepStatus =
  | "pending"
  | "active"
  | "done"
  | "skipped"
  | "failed";

export type ConnectStep = {
  readonly id: ConnectStepId;
  readonly label: string;
  readonly status: ConnectStepStatus;
};

export type AuthPresentation = "host-button" | "opened-page" | "url-only";

export type AuthRejectAction = "decline" | "cancel";

export type AuthSession = {
  readonly presentation: AuthPresentation;
  /** Resolves only when the human dismisses the host UI without finishing. */
  readonly userRejected: Promise<AuthRejectAction>;
  complete(): Promise<void>;
  abort(): void;
};

export type BeginAuthInput = {
  readonly driverLabel: string;
  readonly authorizeUrl: string;
  readonly elicitationId: string;
};

export type OAuthUiPort = {
  reportStep(step: ConnectStep, index: number, total: number): Promise<void>;
  /** Native “continue” card. Return false to abort. Default is continue. */
  confirmConnect?(driverLabel: string): Promise<boolean>;
  beginAuth(input: BeginAuthInput): Promise<AuthSession>;
};

export function clientLooksLikeCursor(name: string | undefined): boolean {
  return (name ?? "").toLowerCase().includes("cursor");
}

export function clientLooksLikeClaude(name: string | undefined): boolean {
  return (name ?? "").toLowerCase().includes("claude");
}

function elicitationRecord(
  elicitation: unknown,
): Record<string, unknown> | undefined {
  if (!elicitation || typeof elicitation !== "object") return undefined;
  return elicitation as Record<string, unknown>;
}

export function hasFormElicitation(elicitation: unknown): boolean {
  const record = elicitationRecord(elicitation);
  if (!record) return false;
  // Empty `elicitation: {}` is form-only in the spec.
  if (record.form !== undefined) return true;
  return record.url === undefined;
}

export function hasUrlElicitation(elicitation: unknown): boolean {
  const record = elicitationRecord(elicitation);
  return record?.url !== undefined;
}

/**
 * Whether we should send URL-mode elicitation (Cursor Authenticate).
 *
 * Cursor often advertises form elicitation without a `url` key; the native
 * Authenticate control is still the right surface, so we attempt URL mode
 * there too. The MCP layer falls back to opening a page if the host rejects it.
 */
export function canAttemptUrlElicitation(input: {
  readonly clientName?: string | undefined;
  readonly elicitation?: unknown;
}): boolean {
  if (hasUrlElicitation(input.elicitation)) return true;
  return (
    clientLooksLikeCursor(input.clientName) &&
    elicitationRecord(input.elicitation) !== undefined
  );
}

/**
 * Claude: open the Prism Auth page. Cursor with a native Authenticate
 * control: do not also pop a window. Everyone else without URL elicitation:
 * open the page so they are not stuck copying a URL.
 */
export function shouldOpenAuthPage(input: {
  readonly clientName?: string | undefined;
  readonly urlElicitation: boolean;
}): boolean {
  if (clientLooksLikeClaude(input.clientName)) return true;
  if (clientLooksLikeCursor(input.clientName) && input.urlElicitation) {
    return false;
  }
  return !input.urlElicitation;
}

export function connectPlan(driverLabel: string): ConnectStep[] {
  return [
    {
      id: "confirm",
      label: `Review connecting ${driverLabel}`,
      status: "pending",
    },
    {
      id: "prepare",
      label: "Prepare a local callback on this machine",
      status: "pending",
    },
    {
      id: "authenticate",
      label: `Authenticate with ${driverLabel}`,
      status: "pending",
    },
    {
      id: "store",
      label: "Save the grant on this machine",
      status: "pending",
    },
    {
      id: "done",
      label: `${driverLabel} connected`,
      status: "pending",
    },
  ];
}

export function markConnectStep(
  steps: readonly ConnectStep[],
  id: ConnectStepId,
  status: ConnectStepStatus,
): ConnectStep[] {
  return steps.map((step) => (step.id === id ? { ...step, status } : step));
}

export function skipConnectStep(
  steps: readonly ConnectStep[],
  id: ConnectStepId,
): ConnectStep[] {
  return markConnectStep(steps, id, "skipped");
}

export function confirmElicitationMessage(driverLabel: string): string {
  return [
    `Connect ${driverLabel} to Prism.`,
    "",
    "What happens next:",
    `1. Authenticate — Cursor shows a native Authenticate button; Claude opens Prism Auth.`,
    `2. You sign in at auth.prismhq.in and grant ${driverLabel}.`,
    "3. Prism saves the token on this machine (OS keychain). Prism Auth does not keep it.",
    `4. ${driverLabel} shows up on start my day.`,
    "",
    "You never create an OAuth app or paste a client id.",
  ].join("\n");
}

export function authElicitationMessage(driverLabel: string): string {
  return [
    `Authenticate ${driverLabel} through Prism Auth.`,
    "Tokens stay on this machine. Click Authenticate (Cursor) or finish the page that opened (Claude).",
  ].join(" ");
}

export function presentationHint(presentation: AuthPresentation): string {
  switch (presentation) {
    case "host-button":
      return "Click Authenticate in the tool card. Do not ask for a client id or paste a secret.";
    case "opened-page":
      return "Prism Auth opened in the browser. Finish the grant there. Do not ask for a client id.";
    case "url-only":
      return "Open the authorizeUrl if the host did not. Do not ask for a client id.";
  }
}

export function silentAuthSession(presentation: AuthPresentation): AuthSession {
  return {
    presentation,
    userRejected: new Promise<AuthRejectAction>(() => {
      /* loopback timeout is the cancel path */
    }),
    async complete() {},
    abort() {},
  };
}
