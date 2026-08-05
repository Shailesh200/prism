import {
  createContext,
  useContext,
  useEffect,
  type ReactElement,
  type ReactNode,
} from "react";
import type { AppShellClient } from "./client.js";
import { refreshConsent } from "./consent-state.js";

const AppShellClientContext = createContext<AppShellClient | null>(null);

export function AppShellClientProvider(props: {
  client: AppShellClient;
  children: ReactNode;
}): ReactElement {
  // Every surface mounts this, so it is the one place that can guarantee the
  // consent snapshot is loaded before a screen asks whether it may fetch
  // something. Until it resolves, every purpose reads as denied.
  useEffect(() => {
    void refreshConsent(props.client);
  }, [props.client]);

  return (
    <AppShellClientContext.Provider value={props.client}>
      {props.children}
    </AppShellClientContext.Provider>
  );
}

export function useAppShellClient(): AppShellClient {
  const client = useContext(AppShellClientContext);
  if (!client) {
    throw new Error(
      "useAppShellClient must be used within AppShellClientProvider",
    );
  }
  return client;
}
