import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useApi } from "../session";
import {
  allowed,
  defaults,
  groups,
  schemas,
  serializeCreate,
  serializeTemplate,
  creationErrors,
  type Values,
  type Mode,
  validate,
} from "../lib/forms";
import { Choice, SchemaField, Review } from "../components/schema-form";
import { Heading, Failure } from "../components/common";
import { FieldGroup } from "../components/ui/field";
import { Button } from "../components/ui/button";
const steps = ["启动来源", "运行配置", "存储与网络", "生命周期", "确认"];
const stepInfo: Record<number, { title: string; desc: string }> = {
  1: { title: "运行配置", desc: "配置沙箱的计算资源、运行参数和环境变量" },
  2: { title: "存储与网络", desc: "配置存储卷挂载和网络访问策略" },
  3: { title: "生命周期", desc: "配置生命周期钩子和扩展参数" },
};
export function CreatePage({ template = false }: { template?: boolean }) {
  const [params] = useSearchParams();
  const initialMode: Mode = params.has("snapshotId")
    ? "snapshot"
    : params.has("templateId")
      ? "template"
      : "image";
  const [mode, setMode] = useState<Mode>(initialMode);
  const [step, setStep] = useState(0);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState<unknown>(null);
  const form = useForm<Values>({
    defaultValues: template
      ? {
          image: "",
          publish: "",
          resourceLimits: { cpu: "1", memory: "512Mi", disk: "2Gi" },
          format: "overlaybd",
        }
      : defaults(
          initialMode,
          params.get("snapshotId") || params.get("templateId") || "",
        ),
  });
  const api = useApi();
  const nav = useNavigate();
  const cache = useQueryClient();
  const schema = template
    ? schemas.CreateFsbTemplateRequest
    : schemas.CreateSandboxRequest;
  const mutation = useMutation({
    mutationFn: async (body: Values) =>
      template
        ? api.createTemplate(serializeTemplate(body))
        : api.create(serializeCreate(mode, body)),
    onSuccess: (data) => {
      void cache.invalidateQueries();
      nav(
        template
          ? `/templates/${"templateId" in data ? data.templateId : ""}`
          : `/sandboxes/${"id" in data ? data.id : ""}`,
      );
    },
  });
  const fields = template
    ? Object.keys(schema.properties || {})
    : step === 0
      ? mode === "pool"
        ? ["extensions"]
        : [
            mode === "image"
              ? "image"
              : mode === "snapshot"
                ? "snapshotId"
                : "templateId",
          ]
      : groups[step]?.filter((k) => allowed(mode, k)) || [];
  function changeMode(next: Mode) {
    setMode(next);
    form.reset(defaults(next));
    setRevision((v) => v + 1);
    setError(null);
  }
  function next() {
    const values = form.getValues();
    const errors = fields.flatMap((k) =>
      validate(schema.properties![k], values[k], `${k}.`),
    );
    if (step === 0) {
      if (mode === "pool" && !(values.extensions as Values)?.poolRef)
        errors.push("Pool 引用为必填项");
      if (mode === "snapshot" && !values.snapshotId)
        errors.push("快照 ID 为必填项");
      if (mode === "template" && !values.templateId)
        errors.push("模板 ID 为必填项");
    }
    if (errors.length) {
      setError(new Error(errors.join("；")));
      return;
    }
    setError(null);
    setStep((v) => v + 1);
  }
  return (
    <>
      <Heading
        title={template ? "创建模板" : "创建沙箱"}
        description={
          template
            ? "从容器镜像构建 Fast Sandbox 模板"
            : "创建并运行一个新的沙箱环境"
        }
      />
      {!template && (
        <ol className="steps">
          {steps.map((s, i) => (
            <li
              key={s}
              className={
                i === step ? "active" : i < step ? "done" : ""
              }
            >
              <span>{i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
      )}
      <form
        onSubmit={form.handleSubmit((body) => {
          if (!template && step < 4) {
            next();
            return;
          }
          setError(null);
          const errors = template
            ? validate(schema, body)
            : creationErrors(mode, body);
          if (errors.length) {
            setError(new Error(errors.join("；")));
            return;
          }
          mutation.mutate(body);
        })}
      >
        <fieldset disabled={mutation.isPending} className="flex flex-col gap-6">
          <Failure error={error || mutation.error} />
          {!template && step === 0 && (
            <Choice
              label="启动来源"
              value={mode}
              onChange={(v) => changeMode(v as Mode)}
              options={[
                { value: "image", label: "容器镜像" },
                { value: "snapshot", label: "快照恢复" },
                { value: "template", label: "模板" },
                { value: "pool", label: "Pool" },
              ]}
            />
          )}
          {step < 4 || template ? (
            <section
              className={!template && step > 0 ? "form-section" : ""}
              key={`${mode}-${revision}-${step}`}
            >
              {!template && stepInfo[step] && (
                <>
                  <div className="step-section-title">
                    {stepInfo[step].title}
                  </div>
                  <div className="step-section-desc">
                    {stepInfo[step].desc}
                  </div>
                </>
              )}
              <FieldGroup className="creation-fields">
                {fields.map((name) => (
                  <Controller
                    key={name}
                    name={name}
                    control={form.control}
                    render={({ field }) => (
                      <SchemaField
                        name={name}
                        schema={
                          mode === "pool" && step === 0
                            ? {
                                type: "object",
                                properties: {
                                  poolRef: { type: "string", minLength: 1 },
                                },
                                required: ["poolRef"],
                              }
                            : schema.properties![name]
                        }
                        value={field.value}
                        required={
                          template
                            ? schema.required?.includes(name)
                            : ["image", "snapshotId", "templateId"].includes(
                                name,
                              ) ||
                              (name === "extensions" && mode === "pool") ||
                              (name === "timeout" && mode === "template") ||
                              (name === "resourceLimits" &&
                                ["image", "snapshot"].includes(mode)) ||
                              (name === "entrypoint" && mode === "image")
                        }
                        onChange={(value) => {
                          if (value === undefined) {
                            const body = form.getValues();
                            delete body[name];
                            form.reset(body);
                          } else field.onChange(value);
                        }}
                      />
                    )}
                  />
                ))}
              </FieldGroup>
            </section>
          ) : (
            <section className="form-section">
              <h2>确认创建配置</h2>
              <Review value={form.getValues()} />
            </section>
          )}
          <div className="flex justify-end gap-3">
            {step > 0 && !template && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setStep((v) => v - 1);
                  setError(null);
                }}
              >
                <ChevronLeft data-icon="inline-start" />
                上一步
              </Button>
            )}
            <Button type="submit">
              {mutation.isPending
                ? "提交中…"
                : template
                  ? "创建模板"
                  : step === 4
                    ? "确认创建"
                    : "下一步"}
              {!mutation.isPending && !template && step < 4 && (
                <ChevronRight data-icon="inline-end" />
              )}
            </Button>
          </div>
        </fieldset>
      </form>
    </>
  );
}
