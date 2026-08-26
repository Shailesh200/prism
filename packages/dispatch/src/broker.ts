import {
  DEFAULT_AUTH_BROKER_URL,
  type TokenExchange,
} from "./oauth-providers.js";
import { DriverIdSchema, type DriverId } from "./types.js";

export type BrokerDriverStatus = {
  id: DriverId;
  enabled: boolean;
};

export function authBrokerUrl(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.PRISM_DISPATCH_AUTH_BROKER_URL?.trim();
  if (override) return override.replace(/\/$/, "");
  return DEFAULT_AUTH_BROKER_URL;
}

export function brokerStartUrl(
  brokerUrl: string,
  driver: DriverId,
  state: string,
): string {
  const url = new URL("/oauth/start", `${brokerUrl}/`);
  url.searchParams.set("driver", driver);
  url.searchParams.set("state", state);
  return url.toString();
}

export async function listBrokerDrivers(
  brokerUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{
  reachable: boolean;
  drivers: BrokerDriverStatus[];
}> {
  try {
    const response = await fetchImpl(
      new URL("/oauth/drivers", `${brokerUrl}/`),
      {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok) {
      return { reachable: false, drivers: [] };
    }
    const json = (await response.json()) as {
      drivers?: { id?: unknown; enabled?: unknown }[];
    };
    const drivers: BrokerDriverStatus[] = [];
    for (const row of json.drivers ?? []) {
      const parsed = DriverIdSchema.safeParse(row.id);
      if (!parsed.success) continue;
      drivers.push({ id: parsed.data, enabled: row.enabled === true });
    }
    return { reachable: true, drivers };
  } catch {
    return { reachable: false, drivers: [] };
  }
}

export async function redeemBrokerPickup(
  brokerUrl: string,
  pickup: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TokenExchange> {
  const response = await fetchImpl(new URL("/oauth/redeem", `${brokerUrl}/`), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ code: pickup }),
  });
  const json = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(
      typeof json.message === "string"
        ? json.message
        : `Prism Auth redeem failed (${response.status})`,
    );
  }
  const access =
    typeof json.accessToken === "string" ? json.accessToken : undefined;
  if (!access) throw new Error("Prism Auth returned no access token");
  return {
    accessToken: access,
    ...(typeof json.refreshToken === "string"
      ? { refreshToken: json.refreshToken }
      : {}),
    ...(typeof json.expiresAt === "string"
      ? { expiresAt: json.expiresAt }
      : {}),
    ...(json.extra && typeof json.extra === "object"
      ? { extra: json.extra as Record<string, string> }
      : {}),
  };
}
