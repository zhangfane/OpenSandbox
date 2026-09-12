import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useApi } from "../session";
import type { Sandbox, Snapshot, Template, NetworkPolicy } from "../api/client";
import {
  schemas,
  metadataPatch,
  renewDate,
  validate,
  type Values,
} from "../lib/forms";
import {
  Dictionary,
  SchemaField,
  Review,
  Choice,
} from "../components/schema-form";
import {
  Heading,
  Status,
  Failure,
  Loading,
  time,
  transient,
  useVisibleInterval,
  Refresh,
  NoData,
} from "../components/common";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Field, FieldLabel, FieldGroup } from "../components/ui/field";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "../components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../components/ui/dialog";
import {
  Table,
  TableHeader,
  TableHead,
  TableRow,
  TableBody,
  TableCell,
} from "../components/ui/table";
type Kind = "sandboxes" | "snapshots" | "templates";
export function DetailPage({ kind }: { kind: Kind }) {
  const { id = "" } = useParams();
  const api = useApi();
  const interval = useVisibleInterval(2000);
  const query = useQuery({
    queryKey: [kind, id],
    queryFn: async ({ signal }) =>
      kind === "sandboxes"
        ? api.sandbox(id, signal)
        : kind === "snapshots"
          ? api.snapshot(id, signal)
          : api.template(id, signal),
    refetchInterval: (q) => {
      const data = q.state.data;
      if (!data) return false;
      const state =
        "phase" in data.status ? data.status.phase : data.status.state;
      return transient.includes(state) ? interval : false;
    },
  });
  if (query.isPending) return <Loading />;
  if (query.error) return <Failure error={query.error} />;
  if (!query.data) return null;
  if (kind !== "sandboxes")
    return (
      <CatalogDetail
        key={id}
        kind={kind}
        item={query.data as Snapshot | Template}
      />
    );
  const sandbox = query.data as Sandbox;
  return (
    <>
      <Heading
        title={sandbox.metadata?.name || sandbox.id}
        description={sandbox.id}
      >
        <Status state={sandbox.status.state} />
        <SandboxActions sandbox={sandbox} />
        <Refresh
          pending={query.isFetching}
          onClick={() => void query.refetch()}
        />
      </Heading>
      <Tabs defaultValue="overview">
        <TabsList className="detail-tabs">
          <TabsTrigger value="overview">概览</TabsTrigger>
          <TabsTrigger value="metadata">元数据</TabsTrigger>
          <TabsTrigger value="endpoint">端口访问</TabsTrigger>
          <TabsTrigger value="policy">网络策略</TabsTrigger>
          <TabsTrigger value="snapshots">快照</TabsTrigger>
          <TabsTrigger value="diagnostics">诊断</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <section className="form-section">
            <h2>基本信息</h2>
            <dl className="review">
              <div>
                <dt>ID</dt>
                <dd className="font-mono">{id}</dd>
              </div>
              <div>
                <dt>启动来源</dt>
                <dd>
                  {sandbox.image?.uri ||
                    sandbox.snapshotId ||
                    sandbox.allocation?.poolRef ||
                    "—"}
                </dd>
              </div>
              <div>
                <dt>创建时间</dt>
                <dd>{time(sandbox.createdAt)}</dd>
              </div>
              <div>
                <dt>到期时间</dt>
                <dd>{time(sandbox.expiresAt)}</dd>
              </div>
              <div>
                <dt>启动命令</dt>
                <dd className="font-mono">{sandbox.entrypoint.join(" ")}</dd>
              </div>
              <div>
                <dt>状态说明</dt>
                <dd>
                  {sandbox.status.message || sandbox.status.reason || "—"}
                </dd>
              </div>
            </dl>
            {sandbox.platform && <Review value={sandbox.platform as Values} />}
          </section>
        </TabsContent>
        <TabsContent value="metadata">
          <MetadataEditor
            key={JSON.stringify(sandbox.metadata)}
            sandbox={sandbox}
          />
        </TabsContent>
        <TabsContent value="endpoint">
          <EndpointPanel id={id} />
        </TabsContent>
        <TabsContent value="policy">
          <PolicyPanel id={id} />
        </TabsContent>
        <TabsContent value="snapshots">
          <SnapshotPanel id={id} />
        </TabsContent>
        <TabsContent value="diagnostics">
          <DiagnosticsPanel id={id} />
        </TabsContent>
      </Tabs>
    </>
  );
}
function SandboxActions({ sandbox }: { sandbox: Sandbox }) {
  const [action, setAction] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const api = useApi();
  const cache = useQueryClient();
  const nav = useNavigate();
  const mutation = useMutation({
    mutationFn: async (submittedValue: string) => {
      switch (action) {
        case "暂停":
          return api.pause(sandbox.id);
        case "恢复":
          return api.resume(sandbox.id);
        case "续期":
          return api.renew(
            sandbox.id,
            renewDate(submittedValue, sandbox.expiresAt),
          );
        case "创建快照":
          return api.createSnapshot(sandbox.id, submittedValue || undefined);
        case "删除":
          return api.remove(sandbox.id);
        default:
          throw new Error("未知操作");
      }
    },
    onSuccess: () => {
      toast.success("请求已提交，正在刷新服务端状态");
      setAction(null);
      void cache.invalidateQueries();
      if (action === "删除") nav("/sandboxes");
    },
  });
  const state = sandbox.status.state;
  const busy = transient.includes(state) || mutation.isPending;
  return (
    <>
      <Button
        variant="outline"
        disabled={busy || !["Running", "Paused"].includes(state)}
        onClick={() => {
          mutation.reset();
          setAction(state === "Paused" ? "恢复" : "暂停");
        }}
      >
        {state === "Paused" ? "恢复" : "暂停"}
      </Button>
      <Button
        variant="outline"
        disabled={busy || !["Running", "Paused"].includes(state)}
        onClick={() => {
          mutation.reset();
          setValue("");
          setAction("续期");
        }}
      >
        续期
      </Button>
      <Button
        variant="outline"
        disabled={busy || !["Running", "Paused"].includes(state)}
        onClick={() => {
          mutation.reset();
          setValue("");
          setAction("创建快照");
        }}
      >
        创建快照
      </Button>
      <Button
        variant="outline"
        disabled={
          mutation.isPending || ["Stopping", "Terminated"].includes(state)
        }
        onClick={() => {
          mutation.reset();
          setAction("删除");
        }}
      >
        删除
      </Button>
      <Dialog
        open={!!action}
        onOpenChange={(open) => {
          if (!open && !mutation.isPending) setAction(null);
        }}
      >
        {action && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {action === "创建快照" ? "创建快照" : `${action}沙箱`}
              </DialogTitle>
              <DialogDescription>
                {action === "删除"
                  ? `确认永久删除 ${sandbox.metadata?.name || sandbox.id}？此操作会终止沙箱。`
                  : action === "续期"
                    ? "设置新的到期时间，延长沙箱存活时间。"
                    : `对 ${sandbox.metadata?.name || sandbox.id} 执行${action}。`}
              </DialogDescription>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                mutation.mutate(
                  String(
                    new FormData(e.currentTarget).get("actionValue") || "",
                  ),
                );
              }}
            >
              <FieldGroup>
                <Failure error={mutation.error} />
                {["续期", "创建快照"].includes(action || "") && (
                  <Field>
                    <FieldLabel htmlFor="action-value">
                      {action === "续期" ? "新到期时间" : "快照名称（可选）"}
                    </FieldLabel>
                    <Input
                      name="actionValue"
                      id="action-value"
                      required={action === "续期"}
                      type={action === "续期" ? "datetime-local" : "text"}
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                    />
                  </Field>
                )}
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={mutation.isPending}
                    onClick={() => setAction(null)}
                  >
                    取消
                  </Button>
                  <Button
                    type="submit"
                    variant={action === "删除" ? "destructive" : "default"}
                    disabled={mutation.isPending}
                  >
                    {mutation.isPending ? "提交中…" : `确认${action}`}
                  </Button>
                </DialogFooter>
              </FieldGroup>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
function MetadataEditor({ sandbox }: { sandbox: Sandbox }) {
  const [value, setValue] = useState(sandbox.metadata || {});
  const api = useApi();
  const cache = useQueryClient();
  const mutation = useMutation({
    mutationFn: () =>
      api.metadata(sandbox.id, metadataPatch(sandbox.metadata || {}, value)),
    onSuccess: () => {
      toast.success("元数据已更新");
      void cache.invalidateQueries({ queryKey: ["sandboxes"] });
    },
  });
  return (
    <form
      className="form-section"
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
    >
      <h2>编辑元数据</h2>
      <fieldset disabled={mutation.isPending}>
        <Dictionary value={value} onChange={setValue} />
      </fieldset>
      <Failure error={mutation.error} />
      <Button disabled={mutation.isPending} className="mt-5">
        保存元数据
      </Button>
    </form>
  );
}
function PolicyPanel({ id }: { id: string }) {
  const api = useApi();
  const query = useQuery({
    queryKey: ["policy", id],
    queryFn: async ({ signal }) => api.policy(id, signal),
  });
  return query.isPending ? (
    <Loading />
  ) : query.error ? (
    <Failure error={query.error} />
  ) : (
    <PolicyEditor
      key={JSON.stringify(query.data)}
      id={id}
      policy={query.data?.policy || {}}
    />
  );
}
function PolicyEditor({ id, policy }: { id: string; policy: NetworkPolicy }) {
  const [value, setValue] = useState<unknown>(policy);
  const api = useApi();
  const cache = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => {
      const errors = validate(schemas.NetworkPolicy, value);
      if (errors.length) throw new Error(errors.join("；"));
      return api.setPolicy(id, value as NetworkPolicy);
    },
    onSuccess: () => {
      toast.success("网络策略已更新");
      void cache.invalidateQueries({ queryKey: ["policy", id] });
    },
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
    >
      <fieldset disabled={mutation.isPending}>
        <SchemaField
          name="networkPolicy"
          schema={schemas.NetworkPolicy}
          value={value}
          onChange={setValue}
          required
        />
      </fieldset>
      <Failure error={mutation.error} />
      <Button className="mt-5" disabled={mutation.isPending}>
        保存网络策略
      </Button>
    </form>
  );
}
function EndpointPanel({ id }: { id: string }) {
  const api = useApi();
  const [port, setPort] = useState("8080");
  const [proxy, setProxy] = useState("false");
  const mutation = useMutation({
    mutationFn: () => api.endpoint(id, Number(port), proxy === "true"),
  });
  return (
    <section className="form-section">
      <h2>端口访问</h2>
      <form
        className="toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
      >
        <Input
          type="number"
          aria-label="端口"
          value={port}
          onChange={(e) => setPort(e.target.value)}
          min={1}
          max={65535}
          required
        />
        <Choice
          label="访问方式"
          value={proxy}
          onChange={setProxy}
          options={[
            { value: "false", label: "直接访问" },
            { value: "true", label: "Server 代理" },
          ]}
        />
        <Button disabled={mutation.isPending}>获取访问地址</Button>
      </form>
      <Failure error={mutation.error} />
      {mutation.data && (
        <>
          <Review value={mutation.data as Values} />
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => {
              void navigator.clipboard
                .writeText(JSON.stringify(mutation.data, null, 2))
                .then(() => toast.success("地址及请求头已复制"))
                .catch(() => toast.error("无法访问剪贴板"));
            }}
          >
            复制地址及请求头
          </Button>
          <p className="text-sm text-muted-foreground mt-3">
            访问时请携带返回的请求头；浏览器地址栏不会自动添加这些头。
          </p>
        </>
      )}
    </section>
  );
}
function SnapshotPanel({ id }: { id: string }) {
  const api = useApi();
  const [page, setPage] = useState(1);
  const interval = useVisibleInterval(10000);
  const query = useQuery({
    queryKey: ["snapshots", "sandbox", id, page],
    queryFn: async ({ signal }) =>
      api.snapshots({ page, pageSize: 20, sandboxId: id }, signal),
    refetchInterval: interval,
  });
  return (
    <>
      <Failure error={query.error} />
      {query.isPending ? (
        <Loading />
      ) : query.data?.items?.length ? (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名称 / ID</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>创建时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.items.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <Link to={`/snapshots/${s.id}`}>{s.name || s.id}</Link>
                  </TableCell>
                  <TableCell>
                    <Status state={s.status.state} />
                  </TableCell>
                  <TableCell>{time(s.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex gap-2 mt-4">
            <Button
              variant="outline"
              disabled={page === 1}
              onClick={() => setPage((v) => v - 1)}
            >
              上一页
            </Button>
            <Button
              variant="outline"
              disabled={page * 20 >= (query.data.pagination?.totalItems || 0)}
              onClick={() => setPage((v) => v + 1)}
            >
              下一页
            </Button>
          </div>
        </>
      ) : !query.error ? (
        <NoData />
      ) : null}
    </>
  );
}
function DiagnosticsPanel({ id }: { id: string }) {
  const api = useApi();
  const [kind, setKind] = useState<"logs" | "events">("logs");
  const [scope, setScope] = useState("container");
  const query = useQuery({
    queryKey: ["diagnostics", id, kind, scope],
    queryFn: async ({ signal }) => api.diagnostics(id, kind, scope, signal),
  });
  const data = query.data;
  const url = data?.contentUrl;
  const safeUrl = url && /^https?:\/\//i.test(url) ? url : undefined;
  return (
    <>
      <div className="toolbar">
        <Choice
          label="诊断类型"
          value={kind}
          onChange={(v) => setKind(v as "logs" | "events")}
          options={[
            { value: "logs", label: "日志" },
            { value: "events", label: "事件" },
          ]}
        />
        <Choice
          label="诊断范围"
          value={scope}
          onChange={setScope}
          options={[
            "container",
            "lifecycle",
            "runtime",
            "network",
            "process",
            "all",
          ].map((v) => ({ value: v, label: v }))}
        />
        <Refresh
          pending={query.isFetching}
          onClick={() => void query.refetch()}
        />
      </div>
      <p className="text-muted-foreground text-sm mb-4">
        诊断文本快照；点击刷新获取最新可用内容。
      </p>
      <Failure error={query.error} />
      {query.isPending ? (
        <Loading />
      ) : (
        data && (
          <>
            {data.truncated && <p>内容已被服务端截断。</p>}
            {data.delivery === "inline" ? (
              <pre className="diagnostic">{data.content || "暂无诊断内容"}</pre>
            ) : safeUrl ? (
              <a
                href={safeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline"
              >
                下载诊断内容
                {data.expiresAt ? `（到期：${time(data.expiresAt)}）` : ""}
              </a>
            ) : (
              <p>服务端未返回可用的 HTTP(S) 下载地址。</p>
            )}
          </>
        )
      )}
    </>
  );
}
function CatalogDetail({
  kind,
  item,
}: {
  kind: "snapshots" | "templates";
  item: Snapshot | Template;
}) {
  const template = kind === "templates";
  const id = "id" in item ? item.id : item.templateId;
  const state = "phase" in item.status ? item.status.phase : item.status.state;
  const [confirm, setConfirm] = useState(false);
  const api = useApi();
  const cache = useQueryClient();
  const nav = useNavigate();
  const mutation = useMutation({
    mutationFn: () =>
      template ? api.removeTemplate(id) : api.removeSnapshot(id),
    onSuccess: () => {
      void cache.invalidateQueries();
      nav(`/${kind}`);
      toast.success("删除请求已提交");
    },
  });
  return (
    <>
      <Heading
        title={"name" in item && item.name ? item.name : id}
        description={template ? "模板详情" : "快照详情"}
      >
        <Status state={state} />
        <Button asChild disabled={!["Ready", "Succeeded"].includes(state)}>
          {["Ready", "Succeeded"].includes(state) ? (
            <Link
              to={`/sandboxes/new?${template ? "templateId" : "snapshotId"}=${encodeURIComponent(id)}`}
            >
              {template ? "创建沙箱" : "恢复为新沙箱"}
            </Link>
          ) : (
            <span>尚未就绪</span>
          )}
        </Button>
        <Button
          variant="outline"
          disabled={["Creating", "Deleting"].includes(state)}
          onClick={() => setConfirm(true)}
        >
          删除
        </Button>
      </Heading>
      <section className="form-section">
        <Review value={item as unknown as Values} />
      </section>
      <Dialog
        open={confirm}
        onOpenChange={(v) => {
          if (!mutation.isPending) setConfirm(v);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除{template ? "模板" : "快照"}</DialogTitle>
            <DialogDescription>
              确认删除 {id}？此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <Failure error={mutation.error} />
          <DialogFooter>
            <Button
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => setConfirm(false)}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? "提交中…" : "确认删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
