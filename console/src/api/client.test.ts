import { afterEach, describe, it, expect, vi } from "vitest";
import { createApi, normalizeBase, encodeMetadata, ApiError } from "./client";
afterEach(() => vi.unstubAllGlobals());
describe("API transport", () => {
  it("serializes pagination, repeated states and nested metadata encoding", async () => {
    let request: Request | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (r: Request) => {
        request = r;
        return Response.json({ items: [], pagination: { totalItems: 0 } });
      }),
    );
    await createApi("https://server.test/v1", "secret").sandboxes({
      page: 2,
      pageSize: 50,
      state: ["Running", "Paused"],
      metadata: encodeMetadata({ project: "a&b", name: "x=y" }),
    });
    const url = new URL(request!.url);
    expect(url.pathname).toBe("/v1/sandboxes");
    expect(url.searchParams.getAll("state")).toEqual(["Running", "Paused"]);
    expect(url.searchParams.get("page")).toBe("2");
    expect(
      new URLSearchParams(url.searchParams.get("metadata")!).get("project"),
    ).toBe("a&b");
    expect(request!.headers.get("OPEN-SANDBOX-API-KEY")).toBe("secret");
    expect(request!.redirect).toBe("error");
  });
  it.each([401, 403, 404, 409, 429, 501])(
    "retains error details for %s without retry",
    async (status) => {
      const fetch = vi.fn(async () =>
        Response.json(
          { code: "RUNTIME::ERROR", message: "reason" },
          { status, headers: { "X-Request-ID": "req-1" } },
        ),
      );
      vi.stubGlobal("fetch", fetch);
      const expired = vi.fn();
      await expect(
        createApi("https://test/v1", "key", expired).sandbox("s"),
      ).rejects.toMatchObject({
        status,
        code: "RUNTIME::ERROR",
        message: "reason",
        requestId: "req-1",
      });
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(expired).toHaveBeenCalledTimes(status === 401 ? 1 : 0);
    },
  );
  it("accepts empty 204 write responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 204 })),
    );
    await expect(
      createApi("https://test/v1", "k").remove("s"),
    ).resolves.toBeUndefined();
  });
  it("sends snapshot names and absolute renewal times", async () => {
    const bodies: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (r: Request) => {
        bodies.push(await r.json());
        return Response.json({});
      }),
    );
    const api = createApi("https://test/v1", "k");
    await api.createSnapshot("s", "copy");
    await api.renew("s", "2030-01-01T00:00:00.000Z");
    expect(bodies).toEqual([
      { name: "copy" },
      { expiresAt: "2030-01-01T00:00:00.000Z" },
    ]);
  });
});
it("normalizes same-origin paths and rejects embedded secrets", () => {
  expect(normalizeBase("/v1/", "https://test")).toBe("https://test/v1");
  expect(() =>
    normalizeBase("https://user:key@test", "https://test"),
  ).toThrow();
  expect(() => normalizeBase("javascript:alert(1)", "https://test")).toThrow();
  expect(new ApiError(409, "conflict", "busy")).toBeInstanceOf(Error);
});
