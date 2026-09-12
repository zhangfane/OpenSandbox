import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { ApiError } from "../api/client";
import { Alert, AlertTitle, AlertDescription } from "./ui/alert";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "./ui/empty";
import { Choice } from "./schema-form";
const states: Record<string, string> = {
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
  Building: "构建中",
  Succeeded: "已就绪",
};
export const transient = [
  "Pending",
  "Pausing",
  "Resuming",
  "Stopping",
  "Creating",
  "Deleting",
  "Building",
];
export function Status({ state }: { state: string }) {
  return (
    <Badge variant="outline" className="status" data-state={state}>
      <span /> {states[state] || state}
    </Badge>
  );
}
export function time(value?: string) {
  if (!value) return "手动清理";
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function Failure({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <Alert variant="destructive">
      <AlertCircle />
      <AlertTitle>
        {error instanceof ApiError
          ? {
              401: "认证失败",
              403: "权限或配额限制",
              404: "资源不存在",
              409: "当前状态不允许此操作",
              501: "当前运行时不支持此功能",
            }[error.status] || "请求失败"
          : "操作失败"}
      </AlertTitle>
      <AlertDescription>
        {error instanceof Error ? error.message : String(error)}
        {error instanceof ApiError && (
          <span className="block font-mono text-xs">
            {error.code}
            {error.requestId ? ` · Request ID: ${error.requestId}` : ""}
          </span>
        )}
      </AlertDescription>
    </Alert>
  );
}
export function Loading() {
  return (
    <div className="flex flex-col gap-4" aria-label="加载中">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
export function NoData() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>暂无数据</EmptyTitle>
        <EmptyDescription>调整筛选条件，或创建第一个资源。</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
export function Heading({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}
export function Refresh({
  onClick,
  pending,
}: {
  onClick: () => void;
  pending?: boolean;
}) {
  return (
    <Button variant="outline" onClick={onClick} disabled={pending}>
      <RefreshCw data-icon="inline-start" />
      刷新
    </Button>
  );
}
export function Pager({
  page,
  size,
  total,
  onPage,
  onSize,
  unit = "资源",
}: {
  unit?: string;
  page: number;
  size: number;
  total: number;
  onPage: (n: number) => void;
  onSize: (n: number) => void;
}) {
  return (
    <footer className="pager">
      <span>
        共 {total} 个{unit}
      </span>
      <div className="flex items-center gap-3">
        <span>每页</span>
        <Choice
          label="每页条数"
          value={String(size)}
          onChange={(v) => onSize(Number(v))}
          options={[20, 50, 100].map((n) => ({
            value: String(n),
            label: `${n} 条`,
          }))}
        />
        <Button
          variant="outline"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          上一页
        </Button>
        <span aria-label="当前页">{page}</span>
        <Button
          variant="outline"
          disabled={page * size >= total}
          onClick={() => onPage(page + 1)}
        >
          下一页
        </Button>
      </div>
    </footer>
  );
}
export function useVisibleInterval(ms: number) {
  const [visible, setVisible] = useState(!document.hidden);
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  return visible ? ms : false;
}
