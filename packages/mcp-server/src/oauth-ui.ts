/**
 * MCP host for Dispatch connect (ADR-0037).
 *
 * Cursor: URL elicitation is the native Authenticate control that opens
 * Prism Auth / the vendor login. Do not also `open` a window when that
 * control is shown. Claude: skip the extra card and open Prism Auth.
 * Tokens never pass through this layer — the loopback + keychain stay in
 * `@repo-prism/dispatch`.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type {
  ServerNotification,
  ServerRequest,
} from "@modelcontextprotocol/sdk/types.js";
import { ElicitResultSchema } from "@modelcontextprotocol/sdk/types.js";
import {
  authElicitationMessage,
  canAttemptUrlElicitation,
  clientLooksLikeClaude,
  confirmElicitationMessage,
  hasFormElicitation,
  openInBrowser,
  shouldOpenAuthPage,
  type AuthPresentation,
  type AuthRejectAction,
  type AuthSession,
  type BeginAuthInput,
  type ConnectStep,
  type OAuthUiPort,
} from "@repo-prism/dispatch";

const AUTH_TIMEOUT_MS = 180_000;

const noopComplete = async (): Promise<void> => undefined;

type ToolExtra = RequestHandlerExtra<ServerRequest, ServerNotification>;

export function createMcpOAuthUi(
  server: McpServer,
  extra: ToolExtra,
): OAuthUiPort {
  const caps = server.server.getClientCapabilities();
  const clientName = server.server.getClientVersion()?.name;
  const elicitation = caps?.elicitation;
  const attemptUrl = canAttemptUrlElicitation({ clientName, elicitation });
  const openPage = shouldOpenAuthPage({
    clientName,
    urlElicitation: attemptUrl,
  });
  const confirm =
    !clientLooksLikeClaude(clientName) && hasFormElicitation(elicitation);

  return {
    async reportStep(step: ConnectStep, index: number, total: number) {
      const token = extra._meta?.progressToken;
      if (token !== undefined) {
        await extra.sendNotification({
          method: "notifications/progress",
          params: {
            progressToken: token,
            progress: index,
            total,
            message: step.label,
          },
        });
      }
      await server.sendLoggingMessage({
        level: "info",
        logger: "prism.dispatch",
        data: `Connect… ${index}/${total} ${step.label}`,
      });
    },
    ...(confirm
      ? {
          async confirmConnect(driverLabel: string) {
            try {
              const result = await extra.sendRequest(
                {
                  method: "elicitation/create",
                  params: {
                    mode: "form",
                    message: confirmElicitationMessage(driverLabel),
                    requestedSchema: {
                      type: "object",
                      properties: {
                        continue: {
                          type: "boolean",
                          title: "Continue",
                          description: `Connect ${driverLabel} through Prism Auth`,
                          default: true,
                        },
                      },
                      required: ["continue"],
                    },
                  },
                },
                ElicitResultSchema,
                {
                  timeout: 45_000,
                  resetTimeoutOnProgress: true,
                  signal: extra.signal,
                  relatedRequestId: extra.requestId,
                },
              );
              if (result.action !== "accept") return false;
              return result.content?.continue !== false;
            } catch {
              return true;
            }
          },
        }
      : {}),
    async beginAuth(input: BeginAuthInput) {
      return startAuthSession(server, extra, input, {
        attemptUrl,
        openPage,
      });
    },
  };
}

async function startAuthSession(
  server: McpServer,
  extra: ToolExtra,
  input: BeginAuthInput,
  flags: {
    readonly attemptUrl: boolean;
    readonly openPage: boolean;
  },
): Promise<AuthSession> {
  let presentation: AuthPresentation = flags.openPage
    ? "opened-page"
    : flags.attemptUrl
      ? "host-button"
      : "url-only";
  const abort = new AbortController();
  const signal = extra.signal
    ? AbortSignal.any([extra.signal, abort.signal])
    : abort.signal;

  let rejectUser: ((action: AuthRejectAction) => void) | undefined;
  const userRejected = new Promise<AuthRejectAction>((resolve) => {
    rejectUser = resolve;
  });

  let complete: () => Promise<void> = noopComplete;
  let elicitationStarted = false;

  if (flags.attemptUrl) {
    try {
      const notifier = server.server.createElicitationCompletionNotifier(
        input.elicitationId,
        { relatedRequestId: extra.requestId },
      );
      complete = notifier;
      const params = {
        mode: "url" as const,
        url: input.authorizeUrl,
        elicitationId: input.elicitationId,
        message: input.message ?? authElicitationMessage(input.driverLabel),
      };
      const elicit = server.server.elicitInput(params, {
        timeout: AUTH_TIMEOUT_MS,
        resetTimeoutOnProgress: true,
        signal,
        relatedRequestId: extra.requestId,
      });
      elicitationStarted = true;
      void elicit.then(
        (result) => {
          if (result.action === "decline" || result.action === "cancel") {
            rejectUser?.(result.action);
          }
        },
        () => {
          /* host cancelled or timed out; loopback timeout still applies */
        },
      );
    } catch {
      elicitationStarted = false;
      presentation = "opened-page";
    }
  }

  if (flags.openPage || !elicitationStarted) {
    await openInBrowser(input.authorizeUrl);
    presentation =
      elicitationStarted && flags.openPage
        ? "opened-page"
        : elicitationStarted
          ? presentation
          : "opened-page";
  }

  if (!elicitationStarted && !flags.openPage) {
    presentation = "url-only";
  }

  return {
    presentation,
    userRejected,
    complete,
    abort() {
      abort.abort();
    },
  };
}

/** Test helper: same host policy the MCP layer uses. */
export function mcpConnectPolicy(input: {
  readonly clientName?: string | undefined;
  readonly elicitation?: unknown;
}): {
  readonly attemptUrl: boolean;
  readonly openPage: boolean;
  readonly confirm: boolean;
} {
  const attemptUrl = canAttemptUrlElicitation(input);
  return {
    attemptUrl,
    openPage: shouldOpenAuthPage({
      clientName: input.clientName,
      urlElicitation: attemptUrl,
    }),
    confirm:
      !clientLooksLikeClaude(input.clientName) &&
      hasFormElicitation(input.elicitation),
  };
}
