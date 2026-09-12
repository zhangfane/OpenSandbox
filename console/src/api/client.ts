import createClient from "openapi-fetch";
import type { paths, components } from "./lifecycle.gen";
import type { paths as DiagnosticPaths } from "./diagnostic.gen";
export type Sandbox = components["schemas"]["Sandbox"];
export type CreateSandbox = components["schemas"]["CreateSandboxRequest"];
export type TemplateRequest = components["schemas"]["CreateFsbTemplateRequest"];
export type NetworkPolicy = components["schemas"]["NetworkPolicy"];
export type Snapshot = components["schemas"]["Snapshot"];
export type Template = components["schemas"]["FsbTemplate"];
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public requestId: string | null = null,
  ) {
    super(message);
  }
}
export function normalizeBase(value: string, origin = window.location.origin) {
  const url = new URL(value || "/v1", origin);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error("请输入不含凭据、查询参数的 HTTP(S) API 地址");
  return url.href.replace(/\/$/, "");
}
export function encodeMetadata(values: Record<string, string>) {
  return new URLSearchParams(values).toString();
}
export function createApi(
  baseUrl: string,
  key: string,
  onUnauthorized: () => void = () => {},
  sessionSignal?: AbortSignal,
) {
  const client = createClient<paths & DiagnosticPaths>({
    baseUrl,
    headers: key ? { "OPEN-SANDBOX-API-KEY": key } : {},
    credentials: "omit",
    redirect: "error",
    fetch: (request) =>
      fetch(
        sessionSignal
          ? new Request(request, {
              signal: AbortSignal.any([request.signal, sessionSignal]),
            })
          : request,
      ),
  });
  async function result<T>(
    pending: Promise<{ data?: T; error?: unknown; response: Response }>,
  ): Promise<T> {
    const { data, error, response } = await pending;
    if (!response.ok) {
      if (response.status === 401) onUnauthorized();
      const e =
        error && typeof error === "object"
          ? (error as Record<string, unknown>)
          : {};
      throw new ApiError(
        response.status,
        String(e.code || "HTTP_ERROR"),
        String(e.message || response.statusText),
        response.headers.get("X-Request-ID"),
      );
    }
    return data as T;
  }
  return {
    sandboxes: (
      query: {
        page: number;
        pageSize: number;
        state?: string[];
        metadata?: string;
      },
      signal?: AbortSignal,
    ) => result(client.GET("/sandboxes", { params: { query }, signal })),
    sandbox: (id: string, signal?: AbortSignal) =>
      result(
        client.GET("/sandboxes/{sandboxId}", {
          params: { path: { sandboxId: id } },
          signal,
        }),
      ),
    create: (body: CreateSandbox) =>
      result(client.POST("/sandboxes", { body })),
    remove: (id: string) =>
      result(
        client.DELETE("/sandboxes/{sandboxId}", {
          params: { path: { sandboxId: id } },
        }),
      ),
    pause: (id: string) =>
      result(
        client.POST("/sandboxes/{sandboxId}/pause", {
          params: { path: { sandboxId: id } },
        }),
      ),
    resume: (id: string) =>
      result(
        client.POST("/sandboxes/{sandboxId}/resume", {
          params: { path: { sandboxId: id } },
        }),
      ),
    renew: (id: string, expiresAt: string) =>
      result(
        client.POST("/sandboxes/{sandboxId}/renew-expiration", {
          params: { path: { sandboxId: id } },
          body: { expiresAt },
        }),
      ),
    metadata: (id: string, body: Record<string, string | null>) =>
      result(
        client.PATCH("/sandboxes/{sandboxId}/metadata", {
          params: { path: { sandboxId: id } },
          body,
        }),
      ),
    policy: (id: string, signal?: AbortSignal) =>
      result(
        client.GET("/sandboxes/{sandboxId}/networkpolicy", {
          params: { path: { sandboxId: id } },
          signal,
        }),
      ),
    setPolicy: (id: string, body: NetworkPolicy) =>
      result(
        client.PUT("/sandboxes/{sandboxId}/networkpolicy", {
          params: { path: { sandboxId: id } },
          body,
        }),
      ),
    endpoint: (id: string, port: number, proxy: boolean) =>
      result(
        client.GET("/sandboxes/{sandboxId}/endpoints/{port}", {
          params: {
            path: { sandboxId: id, port },
            query: { use_server_proxy: proxy },
          },
        }),
      ),
    snapshots: (
      query: {
        page: number;
        pageSize: number;
        sandboxId?: string;
        name?: string;
        state?: string[];
      },
      signal?: AbortSignal,
    ) => result(client.GET("/snapshots", { params: { query }, signal })),
    snapshot: (id: string, signal?: AbortSignal) =>
      result(
        client.GET("/snapshots/{snapshotId}", {
          params: { path: { snapshotId: id } },
          signal,
        }),
      ),
    createSnapshot: (id: string, name?: string) =>
      result(
        client.POST("/sandboxes/{sandboxId}/snapshots", {
          params: { path: { sandboxId: id } },
          body: name ? { name } : {},
        }),
      ),
    removeSnapshot: (id: string) =>
      result(
        client.DELETE("/snapshots/{snapshotId}", {
          params: { path: { snapshotId: id } },
        }),
      ),
    templates: (
      query: { page: number; pageSize: number },
      signal?: AbortSignal,
    ) => result(client.GET("/templates", { params: { query }, signal })),
    template: (id: string, signal?: AbortSignal) =>
      result(
        client.GET("/templates/{templateId}", {
          params: { path: { templateId: id } },
          signal,
        }),
      ),
    createTemplate: (body: TemplateRequest) =>
      result(client.POST("/templates", { body })),
    removeTemplate: (id: string) =>
      result(
        client.DELETE("/templates/{templateId}", {
          params: { path: { templateId: id } },
        }),
      ),
    diagnostics: (
      id: string,
      kind: "logs" | "events",
      scope: string,
      signal?: AbortSignal,
    ) =>
      kind === "logs"
        ? result(
            client.GET("/sandboxes/{sandboxId}/diagnostics/logs", {
              params: { path: { sandboxId: id }, query: { scope } },
              signal,
            }),
          )
        : result(
            client.GET("/sandboxes/{sandboxId}/diagnostics/events", {
              params: { path: { sandboxId: id }, query: { scope } },
              signal,
            }),
          ),
  };
}
export type Api = ReturnType<typeof createApi>;
