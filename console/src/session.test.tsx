// @vitest-environment jsdom
import { afterEach, beforeEach, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider, useSession } from "./session";
// Node's fetch requires signals from its own realm, rather than jsdom's.
import { transferableAbortController } from "node:util";
beforeEach(() => {
  vi.stubGlobal("AbortSignal", transferableAbortController().signal.constructor);
  vi.stubGlobal(
    "AbortController",
    class {
      constructor() {
        return transferableAbortController();
      }
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function Probe() {
  const s = useSession();
  return (
    <>
      <span>{s.api ? "connected" : "disconnected"}</span>
      <button onClick={() => void s.connect("https://one.test/v1", "key-one")}>
        connect one
      </button>
      <button onClick={() => void s.connect("https://two.test/v1", "key-two")}>
        connect two
      </button>
      <button onClick={s.disconnect}>disconnect</button>
      <button onClick={() => void s.api?.sandbox("test").catch(() => {})}>
        read
      </button>
    </>
  );
}
it("switching and disconnecting clear cached data without persisting credentials", async () => {
  const storageWrite=vi.spyOn(window.Storage.prototype,"setItem");
  const requests: Request[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (req: Request) => {
      requests.push(req);
      return Response.json({ items: [] });
    }),
  );
  const cache = new QueryClient();
  render(
    <QueryClientProvider client={cache}>
      <SessionProvider>
        <Probe />
      </SessionProvider>
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByText("connect one"));
  await screen.findByText("connected");
  cache.setQueryData(["private"], { secret: "one" });
  fireEvent.click(screen.getByText("connect two"));
  await waitFor(() => expect(cache.getQueryData(["private"])).toBeUndefined());
  fireEvent.click(screen.getByText("read"));
  await waitFor(() =>
    expect(requests.at(-1)!.url).toBe("https://two.test/v1/sandboxes/test"),
  );
  expect(requests.at(-1)!.headers.get("OPEN-SANDBOX-API-KEY")).toBe("key-two");
  expect(storageWrite).not.toHaveBeenCalled();
  cache.setQueryData(["private"], { secret: "two" });
  fireEvent.click(screen.getByText("disconnect"));
  await screen.findByText("disconnected");
  expect(cache.getQueryData(["private"])).toBeUndefined();
});
it("401 clears the session and query data", async () => {
  let status = 200;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json(
        status === 200
          ? { items: [] }
          : { code: "INVALID_KEY", message: "expired" },
        { status },
      ),
    ),
  );
  const cache = new QueryClient();
  render(
    <QueryClientProvider client={cache}>
      <SessionProvider>
        <Probe />
      </SessionProvider>
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByText("connect one"));
  await screen.findByText("connected");
  cache.setQueryData(["data"], ["secret"]);
  status = 401;
  fireEvent.click(screen.getByText("read"));
  await screen.findByText("disconnected");
  expect(cache.getQueryData(["data"])).toBeUndefined();
});
