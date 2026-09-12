import { useId, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Checkbox } from "./ui/checkbox";
import { Field, FieldGroup, FieldLabel, FieldDescription } from "./ui/field";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} from "./ui/select";
import { effective, type Schema, type Values } from "../lib/forms";
export const labels: Record<string, string> = {
  image: "容器镜像",
  uri: "镜像地址",
  auth: "镜像认证",
  username: "用户名",
  password: "密码",
  snapshotId: "快照 ID",
  templateId: "模板 ID",
  poolRef: "Pool 引用",
  timeout: "存活时间（秒）",
  resourceLimits: "资源限制",
  resourceRequests: "资源请求",
  entrypoint: "启动命令（逐项填写参数）",
  env: "环境变量",
  metadata: "元数据",
  platform: "运行平台",
  os: "操作系统",
  architecture: "处理器架构",
  arch: "处理器架构",
  volumes: "存储卷",
  networkPolicy: "网络策略",
  credentialProxy: "凭据代理",
  secureAccess: "安全访问",
  lifecycle: "生命周期钩子",
  extensions: "扩展参数",
  cpu: "CPU",
  memory: "内存",
  gpu: "GPU",
  disk: "磁盘",
  name: "名称",
  mountPath: "容器挂载路径",
  readOnly: "只读挂载",
  subPath: "子路径",
  host: "主机目录",
  path: "主机路径",
  pvc: "平台卷",
  claimName: "卷名称",
  createIfNotExists: "不存在时创建",
  deleteOnSandboxTermination: "随沙箱删除新建卷",
  storageClass: "存储类",
  storage: "存储容量",
  accessModes: "访问模式",
  ossfs: "OSS 存储",
  bucket: "Bucket",
  endpoint: "Endpoint",
  accessKeyId: "Access Key ID",
  accessKeySecret: "Access Key Secret",
  version: "版本",
  options: "挂载选项",
  defaultAction: "默认动作",
  egress: "出站规则",
  action: "动作",
  target: "目标域名",
  enabled: "启用",
  preStart: "启动前钩子",
  periodic: "周期钩子",
  command: "命令与参数",
  timeoutSeconds: "执行超时（秒）",
  schedule: "调度表达式",
  publish: "发布目标（s3://）",
  format: "存储格式",
  readiness: "就绪检查",
  probe: "探针",
  warmupSeconds: "预热时间（秒）",
};
export function Choice({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  label: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
function initial(schema: Schema): unknown {
  schema = effective(schema);
  if (schema.default !== undefined) return schema.default;
  if (schema.properties)
    return Object.fromEntries(
      (schema.required || []).map((k) => [k, initial(schema.properties![k])]),
    );
  if (schema.type === "object") return {};
  if (schema.type === "array") return [];
  if (schema.type === "boolean") return false;
  if (schema.type === "integer") return schema.minimum || 0;
  return schema.enum?.[0] || "";
}
export function Dictionary({
  value,
  onChange,
  secret = false,
}: {
  value: Record<string, string>;
  onChange: (v: Record<string, string>) => void;
  secret?: boolean;
}) {
  const [rows, setRows] = useState(() =>
    Object.entries(value)
      .filter(([, val]) => val !== undefined)
      .map(([key, val]) => ({ id: crypto.randomUUID(), key, val })),
  );
  const [error, setError] = useState("");
  function update(next: typeof rows) {
    setRows(next);
    const keys = next.map((r) => r.key);
    const invalid =
      keys.some((k) => !k.trim()) || new Set(keys).size !== keys.length;
    setError(invalid ? "键不能为空或重复" : "");
    if (!invalid) onChange(Object.fromEntries(next.map((r) => [r.key, r.val])));
  }
  return (
    <FieldGroup>
      {rows.map((row, i) => (
        <div className="kv-row" key={row.id}>
          <Input
            aria-label={`键 ${i + 1}`}
            required
            ref={(el) => {
              el?.setCustomValidity(
                rows.some((r, j) => j !== i && r.key === row.key)
                  ? "键不能重复"
                  : "",
              );
            }}
            value={row.key}
            onChange={(e) =>
              update(
                rows.map((r) =>
                  r.id === row.id ? { ...r, key: e.target.value } : r,
                ),
              )
            }
          />
          <Input
            aria-label={`值 ${i + 1}`}
            type={secret ? "password" : "text"}
            value={row.val}
            onChange={(e) =>
              update(
                rows.map((r) =>
                  r.id === row.id ? { ...r, val: e.target.value } : r,
                ),
              )
            }
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`删除键值 ${i + 1}`}
            onClick={() => update(rows.filter((r) => r.id !== row.id))}
          >
            <Trash2 />
          </Button>
        </div>
      ))}
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <Button
        type="button"
        variant="outline"
        className="self-start"
        onClick={() => {
          const key = `key${rows.length + 1}`;
          update([...rows, { id: crypto.randomUUID(), key, val: "" }]);
        }}
      >
        <Plus data-icon="inline-start" />
        添加键值
      </Button>
    </FieldGroup>
  );
}
export function SchemaField({
  name,
  schema,
  value,
  onChange,
  required = false,
}: {
  name: string;
  schema: Schema;
  value: unknown;
  onChange: (v: unknown) => void;
  required?: boolean;
}) {
  const id = useId();
  schema = effective(schema);
  const title = labels[name] || name;
  if (["resourceLimits", "resourceRequests"].includes(name))
    schema = {
      ...schema,
      properties: {
        cpu: { type: "string" },
        memory: { type: "string" },
        gpu: { type: "string" },
        disk: { type: "string" },
      },
    };
  const object = schema.type === "object" || !!schema.properties;
  const secret = /password|secret|accessKey/i.test(name);
  const enabled = value !== undefined && value !== null;
  return (
    <Field
      data-field-name={name}
      className={object || schema.type === "array" ? "form-section" : ""}
    >
      <div className="flex items-center justify-between gap-3">
        <FieldLabel htmlFor={id}>
          {title}
          {required ? " *" : ""}
        </FieldLabel>
        {!required && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange(enabled ? undefined : initial(schema))}
          >
            {enabled ? "移除" : "设置"}
          </Button>
        )}
      </div>
      {name === "timeout" && (
        <FieldDescription>
          默认 3600 秒；移除表示手动清理，是否支持由运行时决定。
        </FieldDescription>
      )}
      {enabled &&
        (object ? (
          schema.properties ? (
            <FieldGroup>
              {Object.entries(schema.properties).map(([key, child]) => (
                <SchemaField
                  key={key}
                  name={key}
                  schema={child}
                  required={schema.required?.includes(key)}
                  value={(value as Values)[key]}
                  onChange={(v) => {
                    const next = { ...(value as Values) };
                    if (v === undefined) delete next[key];
                    else next[key] = v;
                    onChange(next);
                  }}
                />
              ))}
              {["resourceLimits", "resourceRequests"].includes(name) && (
                <Field>
                  <FieldLabel>其他资源</FieldLabel>
                  <Dictionary
                    value={Object.fromEntries(
                      Object.entries(value as Record<string, string>).filter(
                        ([k]) => !["cpu", "memory", "gpu", "disk"].includes(k),
                      ),
                    )}
                    onChange={(extra) =>
                      onChange({
                        ...Object.fromEntries(
                          Object.entries(value as Values).filter(([k]) =>
                            ["cpu", "memory", "gpu", "disk"].includes(k),
                          ),
                        ),
                        ...extra,
                      })
                    }
                  />
                </Field>
              )}
            </FieldGroup>
          ) : (
            <Dictionary
              value={value as Record<string, string>}
              onChange={onChange}
              secret={name === "env"}
            />
          )
        ) : schema.type === "array" ? (
          <ArrayField
            name={name}
            schema={schema.items || { type: "string" }}
            value={value as unknown[]}
            onChange={onChange}
          />
        ) : schema.enum ? (
          <Choice
            label={title}
            value={String(value)}
            onChange={onChange}
            options={schema.enum.map((v) => ({ value: v, label: v }))}
          />
        ) : schema.type === "boolean" ? (
          <div className="flex items-center gap-2">
            <Checkbox
              id={id}
              checked={Boolean(value)}
              onCheckedChange={(v) => onChange(v === true)}
            />
            <label htmlFor={id} className="text-sm">
              {title}
            </label>
          </div>
        ) : (
          <Input
            id={id}
            aria-label={title}
            type={
              secret
                ? "password"
                : schema.type === "integer" || schema.type === "number"
                  ? "number"
                  : "text"
            }
            min={schema.minimum}
            max={schema.maximum}
            value={String(value ?? "")}
            onChange={(e) =>
              onChange(
                schema.type === "integer" || schema.type === "number"
                  ? e.target.value === ""
                    ? undefined
                    : Number(e.target.value)
                  : e.target.value,
              )
            }
          />
        ))}
    </Field>
  );
}
function ArrayField({
  name,
  schema,
  value,
  onChange,
}: {
  name: string;
  schema: Schema;
  value: unknown[];
  onChange: (v: unknown) => void;
}) {
  return (
    <FieldGroup>
      {value.map((item, i) => (
        <div className="array-row" key={i}>
          <SchemaField
            name={
              schema.properties ? "name" : `${labels[name] || name} ${i + 1}`
            }
            schema={schema}
            value={item}
            required
            onChange={(v) =>
              onChange(value.map((old, j) => (j === i ? v : old)))
            }
          />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={`删除 ${labels[name] || name} ${i + 1}`}
            onClick={() => onChange(value.filter((_, j) => j !== i))}
          >
            <Trash2 />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        className="self-start"
        onClick={() => onChange([...value, initial(schema)])}
      >
        <Plus data-icon="inline-start" />
        添加{labels[name] || name}
      </Button>
    </FieldGroup>
  );
}
export function Review({ value }: { value: Values }) {
  return (
    <dl className="review">
      {Object.entries(value)
        .filter(([, val]) => val !== undefined)
        .map(([key, val]) => (
          <div key={key}>
            <dt>{labels[key] || key}</dt>
            <dd>
              {/password|secret|accessKey|env/i.test(key) ? (
                "••••••"
              ) : val && typeof val === "object" ? (
                !Array.isArray(val) ? (
                  <Review value={val as Values} />
                ) : (
                  <div className="flex flex-col gap-2">
                    {val.map((item, i) => (
                      <div key={i}>
                        {item && typeof item === "object" ? (
                          <Review value={item as Values} />
                        ) : (
                          String(item)
                        )}
                      </div>
                    ))}
                  </div>
                )
              ) : (
                String(val)
              )}
            </dd>
          </div>
        ))}
    </dl>
  );
}
