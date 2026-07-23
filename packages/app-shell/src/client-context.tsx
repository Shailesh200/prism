import {
  createContext,
  useContext,
  type ReactElement,
  type ReactNode,
} from "react";
import type { AppShellClient } from "./client.js";

const AppShellClientContext = createContext<AppShellClient | null>(null);

export function AppShellClientProvider(props: {
  client: AppShellClient;
  children: ReactNode;
}): ReactElement {
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
