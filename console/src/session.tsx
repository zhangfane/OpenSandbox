import {
  createContext,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { QueryClient, useQueryClient } from "@tanstack/react-query";
import { createApi, normalizeBase, type Api } from "./api/client";
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: true,
      refetchIntervalInBackground: false,
    },
    mutations: { retry: false },
  },
});
type Session = {
  api: Api | null;
  base: string;
  connect: (base: string, key: string) => Promise<void>;
  disconnect: () => void;
};
const Context = createContext<Session | null>(null);
export function SessionProvider({ children }: { children: ReactNode }) {
  const cache = useQueryClient();
  const active = useRef<AbortController | null>(null);
  const attempt = useRef(0);
  const [connection, setConnection] = useState<{
    base: string;
    api: Api;
  } | null>(null);
  function disconnect() {
    attempt.current++;
    active.current?.abort();
    active.current = null;
    void cache.cancelQueries();
    cache.clear();
    setConnection(null);
  }
  async function connect(base: string, key: string) {
    const ticket = ++attempt.current;
    const normalized = normalizeBase(base);
    await createApi(normalized, key).sandboxes({ page: 1, pageSize: 1 });
    if (ticket !== attempt.current) return;
    active.current?.abort();
    await cache.cancelQueries();
    cache.clear();
    const controller = new AbortController();
    active.current = controller;
    const api = createApi(
      normalized,
      key,
      () => {
        if (active.current === controller) disconnect();
      },
      controller.signal,
    );
    setConnection({ base: normalized, api });
  }
  return (
    <Context.Provider
      value={{
        api: connection?.api || null,
        base: connection?.base || "/v1",
        connect,
        disconnect,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useSession() {
  const value = useContext(Context);
  if (!value) throw new Error("Missing SessionProvider");
  return value;
}
export function useApi() {
  const { api } = useSession();
  if (!api) throw new Error("Disconnected");
  return api;
}
