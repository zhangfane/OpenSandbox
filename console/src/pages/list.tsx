import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Eye, Plus, Search, MoreHorizontal } from "lucide-react";
import { useApi } from "../session";
import {
  encodeMetadata,
  type Sandbox,
  type Snapshot,
  type Template,
} from "../api/client";
import {
  Heading,
  Failure,
  Loading,
  NoData,
  Status,
  time,
  Pager,
  Refresh,
  useVisibleInterval,
} from "../components/common";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
} from "../components/ui/dropdown-menu";
import { Choice, Dictionary } from "../components/schema-form";
type Kind = "sandboxes" | "snapshots" | "templates";
export function ListPage({ kind }: { kind: Kind }) {
  const api = useApi();
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(20);
  const [name, setName] = useState("");
  const [state, setState] = useState("all");
  const [metadata, setMetadata] = useState<Record<string, string>>({});
  const [showMeta, setShowMeta] = useState(false);
  const [filter, setFilter] = useState({ name: "", metadata: {} });
  const interval = useVisibleInterval(10000);
  const query = useQuery({
    queryKey: [kind, page, size, state, filter],
    queryFn: async ({ signal }) => {
      const q = {
        page,
        pageSize: size,
        ...(state !== "all" ? { state: [state] } : {}),
      };
      return kind === "sandboxes"
        ? api.sandboxes(
            {
              ...q,
              metadata: encodeMetadata({
                ...filter.metadata,
                ...(filter.name ? { name: filter.name } : {}),
              }),
            },
            signal,
          )
        : kind === "snapshots"
          ? api.snapshots(
              { ...q, ...(filter.name ? { name: filter.name } : {}) },
              signal,
            )
          : api.templates(q, signal);
    },
    refetchInterval: interval,
  });
  const title = { sandboxes: "沙箱", snapshots: "快照", templates: "模板" }[
    kind
  ];
  const options =
    kind === "sandboxes"
      ? [
          "Pending",
          "Running",
          "Pausing",
          "Paused",
          "Resuming",
          "Stopping",
          "Terminated",
          "Failed",
        ]
      : ["Creating", "Ready", "Deleting", "Failed"];
  const stateNames: Record<string, string> = {
    Pending: "创建中",
    Running: "运行中",
    Pausing: "暂停中",
    Paused: "已暂停",
    Resuming: "恢复中",
    Stopping: "停止中",
    Terminated: "已终止",
    Failed: "失败",
    Creating: "创建中",
    Ready: "可用",
    Deleting: "删除中",
  };
  return (
    <>
      <Heading
        title={title}
        description={
          kind === "sandboxes"
            ? "管理沙箱的创建、运行与回收"
            : kind === "snapshots"
              ? "保存沙箱状态，并从快照恢复新的沙箱"
              : "构建和管理 Fast Sandbox 模板"
        }
      >
        {kind !== "snapshots" && (
          <Button asChild>
            <Link to={`/${kind}/new`}>
              <Plus data-icon="inline-start" />
              创建{title}
            </Link>
          </Button>
        )}
      </Heading>
      <form
        className="toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setFilter({ name, metadata });
        }}
      >
        {kind !== "templates" && (
          <>
            <div className="search">
              <Search />
              <Input
                aria-label="按名称筛选"
                placeholder="按名称筛选"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => {
                  setPage(1);
                  setFilter({ name, metadata });
                }}
              />
            </div>
            <Choice
              label="状态筛选"
              value={state}
              onChange={(v) => {
                setPage(1);
                setState(v);
              }}
              options={[
                { value: "all", label: "全部状态" },
                ...options.map((v) => ({ value: v, label: stateNames[v] })),
              ]}
            />
          </>
        )}
        <Refresh
          pending={query.isFetching}
          onClick={() => {
            setFilter({ name, metadata });
            void query.refetch();
          }}
        />
        {kind === "sandboxes" && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => setShowMeta((v) => !v)}
          >
            元数据筛选
          </Button>
        )}
      </form>
      {showMeta && (
        <section className="form-section mb-6">
          <Dictionary value={metadata} onChange={setMetadata} />
          <Button
            className="mt-4"
            onClick={() => {
              setPage(1);
              setFilter({ name, metadata });
            }}
          >
            应用筛选
          </Button>
          <p className="text-muted-foreground text-sm mt-2">
            名称对应 metadata.name 精确匹配，多个条件同时满足。
          </p>
        </section>
      )}
      <Failure error={query.error} />
      {query.isPending ? (
        <Loading />
      ) : (
        query.data && (
          <>
            {!query.data.items?.length ? (
              <NoData />
            ) : (
              <div className="table-frame">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>名称 / ID</TableHead>
                      <TableHead>
                        {kind === "snapshots" ? "来源沙箱" : "启动来源"}
                      </TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>创建时间</TableHead>
                      {kind === "sandboxes" && <TableHead>到期时间</TableHead>}
                      <TableHead>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {query.data.items?.map((item) => {
                      const sandbox = item as Sandbox;
                      const snapshot = item as Snapshot;
                      const template = item as Template;
                      const id =
                        kind === "templates" ? template.templateId : sandbox.id;
                      const label =
                        kind === "snapshots"
                          ? snapshot.name
                          : sandbox.metadata?.name;
                      const status =
                        kind === "templates"
                          ? template.status.phase
                          : sandbox.status.state;
                      const source =
                        kind === "templates"
                          ? template.image
                          : kind === "snapshots"
                            ? snapshot.sandboxId
                            : sandbox.image?.uri ||
                              sandbox.snapshotId ||
                              sandbox.allocation?.poolRef ||
                              "—";
                      return (
                        <TableRow key={id}>
                          <TableCell>
                            <Link
                              className="resource-name"
                              to={`/${kind}/${id}`}
                            >
                              {label || id}
                            </Link>
                            <div className="resource-id">{id}</div>
                          </TableCell>
                          <TableCell className="source-cell" title={source}>
                            {source}
                          </TableCell>
                          <TableCell>
                            <Status state={status} />
                          </TableCell>
                          <TableCell>{time(item.createdAt)}</TableCell>
                          {kind === "sandboxes" && (
                            <TableCell>{time(sandbox.expiresAt)}</TableCell>
                          )}
                          <TableCell>
                            <div className="flex gap-2">
                              <Button variant="outline" asChild>
                                <Link to={`/${kind}/${id}`}>
                                  <Eye data-icon="inline-start" />
                                  查看
                                </Link>
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    aria-label={`${id} 更多操作`}
                                  >
                                    <MoreHorizontal />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent>
                                  <DropdownMenuGroup>
                                    <DropdownMenuItem asChild>
                                      <Link to={`/${kind}/${id}`}>
                                        管理{title}
                                      </Link>
                                    </DropdownMenuItem>
                                    {kind === "snapshots" &&
                                      status === "Ready" && (
                                        <DropdownMenuItem asChild>
                                          <Link
                                            to={`/sandboxes/new?snapshotId=${encodeURIComponent(id)}`}
                                          >
                                            恢复为新沙箱
                                          </Link>
                                        </DropdownMenuItem>
                                      )}
                                  </DropdownMenuGroup>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
            <Pager
              unit={title}
              page={page}
              size={size}
              total={query.data.pagination?.totalItems || 0}
              onPage={setPage}
              onSize={(n) => {
                setSize(n);
                setPage(1);
              }}
            />
          </>
        )
      )}
    </>
  );
}
