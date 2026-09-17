import { z } from "zod";
import raw from "../api/forms.gen.json";
import type { CreateSandbox, TemplateRequest } from "../api/client";
export type Values = Record<string, unknown>;
export type Schema = {
  type?: string | string[];
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema;
  enum?: string[];
  default?: unknown;
  additionalProperties?: boolean | Schema;
  oneOf?: Schema[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  pattern?: string;
};
export const schemas = raw as unknown as Record<
  "CreateSandboxRequest" | "CreateFsbTemplateRequest" | "NetworkPolicy",
  Schema
>;
export type Mode = "image" | "snapshot" | "template" | "pool";
export const groups = [
  ["image", "snapshotId", "templateId"],
  [
    "timeout",
    "resourceLimits",
    "resourceRequests",
    "entrypoint",
    "env",
    "metadata",
    "platform",
  ],
  ["volumes", "networkPolicy", "credentialProxy", "secureAccess"],
  ["lifecycle", "extensions"],
];
const forbidden: Record<Mode, string[]> = {
  image: ["snapshotId", "templateId"],
  snapshot: ["image", "templateId"],
  template: [
    "image",
    "snapshotId",
    "entrypoint",
    "env",
    "resourceLimits",
    "resourceRequests",
    "volumes",
    "platform",
    "credentialProxy",
    "secureAccess",
    "lifecycle",
  ],
  pool: [
    "image",
    "snapshotId",
    "templateId",
    "resourceLimits",
    "resourceRequests",
    "networkPolicy",
    "platform",
    "volumes",
    "credentialProxy",
    "lifecycle",
  ],
};
export function allowed(mode: Mode, key: string) {
  return !forbidden[mode].includes(key);
}
export function defaults(mode: Mode, source = ""): Values {
  const common = { timeout: 3600, metadata: {}, extensions: {} };
  if (mode === "template") return { ...common, templateId: source };
  if (mode === "pool") return { ...common, extensions: { poolRef: source } };
  return {
    ...common,
    resourceLimits: { cpu: "500m", memory: "512Mi" },
    ...(mode === "image"
      ? { image: { uri: source || "opensandbox/code-interpreter:latest" }, entrypoint: ["tail", "-f", "/dev/null"] }
      : { snapshotId: source }),
  };
}
export function effective(schema: Schema): Schema {
  return schema.oneOf
    ? schema.oneOf.find((s) => s.type !== "null") || schema
    : schema;
}
export function validate(schema: Schema, value: unknown, path = ""): string[] {
  schema = effective(schema);
  if (value === undefined || value === null) return [];
  const errors: string[] = [];
  if (schema.type === "object" || schema.properties) {
    const v = value as Values;
    for (const key of schema.required || [])
      if (v[key] === undefined || v[key] === "" || v[key] === null)
        errors.push(`${path}${key} 为必填项`);
    for (const [key, item] of Object.entries(v)) {
      const child =
        schema.properties?.[key] ||
        (typeof schema.additionalProperties === "object"
          ? schema.additionalProperties
          : undefined);
      if (child) errors.push(...validate(child, item, `${path}${key}.`));
    }
  } else if (schema.type === "array") {
    const arr = value as unknown[];
    if (schema.minItems && arr.length < schema.minItems)
      errors.push(`${path}至少 ${schema.minItems} 项`);
    arr.forEach((v, i) =>
      errors.push(...validate(schema.items || {}, v, `${path}${i + 1}.`)),
    );
  } else if (typeof value === "number") {
    if (
      !Number.isFinite(value) ||
      (!Number.isInteger(value) && schema.type === "integer")
    )
      errors.push(`${path}需要整数`);
    if (schema.minimum !== undefined && value < schema.minimum)
      errors.push(`${path}最小为 ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum)
      errors.push(`${path}最大为 ${schema.maximum}`);
  } else if (typeof value === "string") {
    if (schema.minLength && value.length < schema.minLength)
      errors.push(`${path}不能为空`);
    if (schema.maxLength && value.length > schema.maxLength)
      errors.push(`${path}最多 ${schema.maxLength} 字符`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value))
      errors.push(`${path}格式不正确`);
    if (schema.enum && !schema.enum.includes(value))
      errors.push(`${path}请选择有效值`);
  }
  return errors;
}
export function creationErrors(mode: Mode, body: Values) {
  const schema = {
    ...schemas.CreateSandboxRequest,
    required:
      mode === "image"
        ? ["image", "resourceLimits", "entrypoint"]
        : mode === "snapshot"
          ? ["snapshotId", "resourceLimits"]
          : mode === "template"
            ? ["templateId", "timeout"]
            : [],
  };
  const errors = validate(schema, body);
  const ext = (body.extensions || {}) as Record<string, string>;
  if (mode === "pool" && !ext.poolRef?.trim()) errors.push("poolRef 为必填项");
  if (mode !== "pool" && ext.poolRef)
    errors.push("仅 Pool 启动模式允许 poolRef");
  for (const key of forbidden[mode])
    if (body[key] !== undefined) errors.push(`${key} 不支持当前启动模式`);
  if (
    body.credentialProxy &&
    (body.credentialProxy as Values).enabled &&
    !body.networkPolicy
  )
    errors.push("凭据代理需要网络策略");
  const volumes = (body.volumes || []) as Values[];
  if (new Set(volumes.map((v) => v.name)).size !== volumes.length)
    errors.push("卷名称不能重复");
  for (const v of volumes) {
    if (["host", "pvc", "ossfs"].filter((k) => v[k] !== undefined).length !== 1)
      errors.push("每个卷必须选择且仅选择一种存储来源");
    if (
      String(v.subPath || "")
        .split("/")
        .includes("..")
    )
      errors.push("卷子路径不能包含 ..");
  }
  const hooks = ((body.lifecycle as Values)?.periodic || []) as Values[];
  if (new Set(hooks.map((h) => h.name)).size !== hooks.length)
    errors.push("周期钩子名称不能重复");
  if (
    ext["access.renew.extend.seconds"] &&
    (!/^\d+$/.test(ext["access.renew.extend.seconds"]) ||
      Number(ext["access.renew.extend.seconds"]) < 300 ||
      Number(ext["access.renew.extend.seconds"]) > 86400)
  )
    errors.push("访问续期秒数必须为 300–86400");
  return errors;
}
export function creationSchema(mode: Mode) {
  return z.record(z.string(), z.unknown()).superRefine((body, ctx) => {
    for (const message of creationErrors(mode, body))
      ctx.addIssue({ code: "custom", message });
  });
}
export function serializeCreate(mode: Mode, body: Values): CreateSandbox {
  return creationSchema(mode).parse(body) as CreateSandbox;
}
export function serializeTemplate(body: Values): TemplateRequest {
  const errors = validate(schemas.CreateFsbTemplateRequest, body);
  if (errors.length) throw new Error(errors.join("；"));
  return body as TemplateRequest;
}
export function metadataPatch(
  before: Record<string, string>,
  after: Record<string, string>,
) {
  return {
    ...Object.fromEntries(
      Object.keys(before)
        .filter((k) => !(k in after))
        .map((k) => [k, null]),
    ),
    ...Object.fromEntries(
      Object.entries(after).filter(([k, v]) => before[k] !== v),
    ),
  };
}
export function renewDate(value: string, current?: string) {
  const date = new Date(value);
  if (
    !Number.isFinite(date.getTime()) ||
    date.getTime() <= Math.max(Date.now(), current ? Date.parse(current) : 0)
  )
    throw new Error("新到期时间必须晚于当前时间和原到期时间");
  return date.toISOString();
}
