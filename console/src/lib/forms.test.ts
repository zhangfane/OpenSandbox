import { describe, it, expect } from "vitest";
import {
  defaults,
  serializeCreate,
  serializeTemplate,
  metadataPatch,
  renewDate,
  schemas,
  creationErrors,
} from "./forms";
describe("creation contract", () => {
  it.each(["image", "snapshot", "template", "pool"] as const)(
    "serializes %s startup without other sources",
    (mode) => {
      const body = serializeCreate(mode, defaults(mode, "source"));
      expect(body.timeout).toBe(3600);
      if (mode === "image") expect(body.image?.uri).toBe("source");
      if (mode === "snapshot") expect(body.snapshotId).toBe("source");
      if (mode === "template") {
        expect(body.templateId).toBe("source");
        expect(body.resourceLimits).toBeUndefined();
      }
      if (mode === "pool") {
        expect(body.extensions?.poolRef).toBe("source");
        expect(body.image).toBeUndefined();
      }
    },
  );
  it("rejects conflicting sources and template fields", () => {
    expect(() =>
      serializeCreate("image", {
        ...defaults("image", "python"),
        snapshotId: "snap",
      }),
    ).toThrow();
    expect(() =>
      serializeCreate("template", {
        ...defaults("template", "tpl"),
        env: { a: "b" },
      }),
    ).toThrow();
  });
  it("preserves all advanced graphical parameter groups", () => {
    const body = {
      ...defaults("image", "python"),
      image: { uri: "python", auth: { username: "u", password: "p" } },
      resourceRequests: { cpu: "250m", memory: "256Mi" },
      platform: { os: "linux", arch: "arm64" },
      env: { EMPTY: "", TOKEN: "secret" },
      metadata: { name: "test" },
      volumes: [
        {
          name: "host",
          host: { path: "/tmp" },
          mountPath: "/data",
          readOnly: true,
          subPath: "child",
        },
        {
          name: "pvc",
          pvc: {
            claimName: "data",
            createIfNotExists: true,
            deleteOnSandboxTermination: true,
            storageClass: "fast",
            storage: "1Gi",
            accessModes: ["ReadWriteOnce"],
          },
          mountPath: "/pvc",
        },
        {
          name: "oss",
          ossfs: {
            bucket: "bucket",
            endpoint: "oss.example.com",
            accessKeyId: "id",
            accessKeySecret: "secret",
            version: "2.0",
            options: ["ro"],
          },
          mountPath: "/oss",
        },
      ],
      networkPolicy: {
        defaultAction: "deny",
        egress: [{ action: "allow", target: "example.com" }],
      },
      credentialProxy: { enabled: true },
      secureAccess: true,
      lifecycle: {
        preStart: { command: ["sh", "-c", "true"], timeoutSeconds: 100 },
        periodic: [
          {
            name: "tick",
            schedule: "@every 30s",
            command: ["true"],
            timeoutSeconds: 20,
          },
        ],
      },
      extensions: { "access.renew.extend.seconds": "300" },
    };
    expect(serializeCreate("image", body)).toEqual(body);
  });
  it("rejects invalid TTL, volume backends and hooks", () => {
    expect(() =>
      serializeCreate("image", { ...defaults("image", "python"), timeout: 10 }),
    ).toThrow();
    expect(() =>
      serializeCreate("image", {
        ...defaults("image", "python"),
        volumes: [
          {
            name: "data",
            mountPath: "/data",
            host: { path: "/tmp" },
            pvc: { claimName: "x" },
          },
        ],
      }),
    ).toThrow();
    expect(
      creationErrors("image", {
        ...defaults("image", "python"),
        lifecycle: {
          periodic: [
            {
              name: "a",
              command: ["x"],
              schedule: "* * * * *",
              timeoutSeconds: 301,
            },
          ],
        },
      }).length,
    ).toBeGreaterThan(0);
  });
  it("allows manual cleanup except template mode", () => {
    expect(
      serializeCreate("image", {
        ...defaults("image", "python"),
        timeout: null,
      }).timeout,
    ).toBeNull();
    expect(() =>
      serializeCreate("template", { templateId: "tpl", timeout: null }),
    ).toThrow();
  });
  it("covers every source field with a rendered schema", () => {
    expect(Object.keys(schemas.CreateSandboxRequest.properties!)).toEqual(
      expect.arrayContaining([
        "volumes",
        "lifecycle",
        "extensions",
        "resourceRequests",
        "secureAccess",
      ]),
    );
  });
  it("validates complete template settings", () => {
    const value = {
      image: "ubuntu",
      publish: "s3://bucket/path",
      format: "overlaybd",
      readiness: { probe: "tcp://localhost:80", warmupSeconds: 60 },
    };
    expect(serializeTemplate(value)).toEqual(value);
    expect(() => serializeTemplate({ image: "x" })).toThrow();
  });
});
it("metadata edits use merge patch deletion semantics", () => {
  expect(metadataPatch({ a: "1", b: "2" }, { a: "1", c: "3" })).toEqual({
    b: null,
    c: "3",
  });
});
it("renewal converts local input to UTC and rejects backwards dates", () => {
  const future = new Date(Date.now() + 7200000).toISOString();
  expect(renewDate(future)).toBe(future);
  expect(() => renewDate("invalid")).toThrow();
  expect(() => renewDate("2000-01-01")).toThrow();
  expect(() =>
    renewDate(future, new Date(Date.now() + 14400000).toISOString()),
  ).toThrow();
});
