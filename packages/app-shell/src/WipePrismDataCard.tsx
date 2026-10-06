/**
 * Settings → General: wipe everything Prism stores on this machine.
 * Goes through the Dashboard API so app-shell never touches `~/.prism` itself.
 */

import type { ConsoleStatus } from "@repo-prism/shared";
import { Input, Text } from "@repo-prism/ui";
import { useId, useState, type ReactElement, type ReactNode } from "react";
import { clearAuditLog } from "./audit-log.js";
import { dashboardLink } from "./hub-link.js";
import { clearIntegrationsState } from "./integrations-store.js";
import { clearTourCompleted } from "./PrismTour.js";

export { dashboardLink };

/** Drop every `prism.*` key this surface stored in the browser. */
export function clearLocalPrismUi(): void {
  clearAuditLog();
  clearIntegrationsState();
  clearTourCompleted();
  if (typeof localStorage === "undefined") return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("prism.")) keys.push(key);
    }
    for (const key of keys) localStorage.removeItem(key);
  } catch {
    /* ignore quota / private-mode */
  }
}

/** Hub-down / proxy failures arrive as Node's "fetch failed". */
export function explainDashboardApiError(message: string): string {
  if (
    /fetch failed|Failed to fetch|ECONNREFUSED|not running|asleep/i.test(
      message,
    )
  ) {
    return "Say prism wake, then reopen Settings.";
  }
  return message;
}

async function readJson(
  url: string,
  token: string,
  init?: RequestInit,
): Promise<unknown> {
  const headers = new Headers(init?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const joined = new URL(
    url,
    typeof window === "undefined" ? "http://127.0.0.1" : window.location.origin,
  );
  if (token && !joined.searchParams.has("token")) {
    joined.searchParams.set("token", token);
  }
  const res = await fetch(joined.toString(), {
    ...init,
    headers,
    cache: "no-store",
  });
  const body: unknown = await res.json().catch(() => undefined);
  if (!res.ok) {
    const err =
      body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : `HTTP ${res.status}`;
    throw new Error(err);
  }
  return body;
}

export function WipePrismDataCard(props: {
  readonly consoleStatus?: ConsoleStatus;
}): ReactElement {
  const link = dashboardLink(props.consoleStatus);
  const wipeId = useId();
  const [wipeText, setWipeText] = useState("");
  const [wiping, setWiping] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [done, setDone] = useState<string | undefined>();

  const wipeAll = async (): Promise<void> => {
    if (!link || wipeText.trim().toLowerCase() !== "wipe") return;
    setWiping(true);
    try {
      const body = (await readJson(`${link.base}/api/wipe`, link.token, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: wipeText }),
      })) as { message?: string };
      clearLocalPrismUi();
      setDone(
        body.message ??
          "Prism data is gone. Reload the Prism MCP server, then open the Dashboard again.",
      );
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setWiping(false);
    }
  };

  return (
    <SettingsCard title="Wipe all Prism data">
      <div className="set-wipe">
        <p className="set-wipe__help">
          Deletes everything Prism stores on this machine: the library
          (~/.prism) and the .prism folder in every registered repository —
          index, lenses, memories, skills, Envelope, receipts, and this
          browser&apos;s Prism settings. Source code and git history stay.
        </p>
        {!link ? (
          <p className="set-wipe__status" role="status">
            Wipe needs the Dashboard API. Say prism wake, then reopen General.
          </p>
        ) : null}
        {error ? (
          <p className="set-wipe__status" role="alert">
            {explainDashboardApiError(error)}
          </p>
        ) : null}
        {done ? (
          <p className="set-wipe__status" role="status">
            {done}
          </p>
        ) : null}
        {link && !done ? (
          <div className="set-wipe__confirm">
            <div className="set-wipe__copy">
              <label className="set-wipe__label" htmlFor={wipeId}>
                Type wipe to confirm
              </label>
              <p className="set-wipe__hint">
                This cannot be undone. Prism will look like a newly installed
                MCP.
              </p>
            </div>
            <div className="set-wipe__row">
              <Input
                id={wipeId}
                aria-label="Type wipe to confirm"
                className="set-wipe__input"
                value={wipeText}
                placeholder="wipe"
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => setWipeText(event.target.value)}
              />
              <button
                type="button"
                className="ov-btn ov-btn--danger"
                disabled={wiping || wipeText.trim().toLowerCase() !== "wipe"}
                onClick={() => void wipeAll()}
              >
                {wiping ? "Wiping…" : "Wipe all Prism data"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </SettingsCard>
  );
}

function SettingsCard(props: {
  title: string;
  children: ReactNode;
}): ReactElement {
  return (
    <section className="ov-card set-card">
      <Text variant="card" as="h2" className="set-card__title">
        {props.title}
      </Text>
      <div className="set-card__body">{props.children}</div>
    </section>
  );
}
