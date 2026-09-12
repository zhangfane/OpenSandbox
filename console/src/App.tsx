import {
  StrictMode,
  Component,
  Suspense,
  lazy,
  type ReactNode,
  useState,
} from "react";
import {
  BrowserRouter,
  NavLink,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useLocation,
} from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { Box, FileText, LayoutGrid, Settings, Menu, X } from "lucide-react";
import { Toaster } from "sonner";
import { SessionProvider, useSession, queryClient } from "./session";
const ListPage = lazy(() =>
  import("./pages/list").then((m) => ({ default: m.ListPage })),
);
const CreatePage = lazy(() =>
  import("./pages/create").then((m) => ({ default: m.CreatePage })),
);
const DetailPage = lazy(() =>
  import("./pages/detail").then((m) => ({ default: m.DetailPage })),
);
import { Heading, Failure, Loading } from "./components/common";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
} from "./components/ui/field";
function Connection() {
  const { base, api, connect, disconnect } = useSession();
  const [address, setAddress] = useState(base);
  const [key, setKey] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const nav = useNavigate();
  return (
    <div className="connection">
      <Heading
        title="连接 OpenSandbox"
        description="使用现有 API Key 管理沙箱生命周期"
      />
      <form
        className="form-section"
        onSubmit={async (e) => {
          e.preventDefault();
          setPending(true);
          setError(null);
          try {
            await connect(address, key);
            setKey("");
            nav("/sandboxes");
          } catch (error) {
            setError(error);
          } finally {
            setPending(false);
          }
        }}
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="server-address">API 地址</FieldLabel>
            <Input
              id="server-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              required
              placeholder="/v1"
            />
            <FieldDescription>默认连接当前 Server 的 /v1。</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="api-key">API Key</FieldLabel>
            <Input
              id="api-key"
              type="password"
              autoComplete="off"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
            <FieldDescription>
              凭据仅保存在内存中，刷新页面后需要重新连接。
            </FieldDescription>
          </Field>
          <Failure error={error} />
          <div className="flex gap-3">
            <Button disabled={pending}>
              {pending ? "连接中…" : "连接服务"}
            </Button>
            {api && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  disconnect();
                  setKey("");
                }}
              >
                断开连接
              </Button>
            )}
          </div>
        </FieldGroup>
      </form>
    </div>
  );
}
function App() {
  const { api, base } = useSession();
  const [menu, setMenu] = useState(false);
  const location = useLocation();
  const section = location.pathname.startsWith("/snapshots")
    ? "快照"
    : location.pathname.startsWith("/templates")
      ? "模板"
      : location.pathname.startsWith("/settings")
        ? "连接设置"
        : "沙箱";
  return (
    <div className="app-shell">
      <aside className={menu ? "sidebar is-open" : "sidebar"}>
        <LinkBrand />
        <nav aria-label="主导航">
          {[
            { path: "/sandboxes", label: "沙箱", Icon: Box },
            { path: "/snapshots", label: "快照", Icon: FileText },
            { path: "/templates", label: "模板", Icon: LayoutGrid },
          ].map(({ path, label, Icon }) => (
            <NavLink key={path} to={path} onClick={() => setMenu(false)}>
              <Icon />
              {label}
            </NavLink>
          ))}
        </nav>
        <NavLink
          className="settings-link"
          to="/settings"
          onClick={() => setMenu(false)}
        >
          <Settings />
          连接设置
        </NavLink>
      </aside>
      {menu && (
        <button
          className="mobile-scrim"
          aria-label="关闭导航"
          onClick={() => setMenu(false)}
        />
      )}
      <div className="workspace">
        <header className="topbar">
          <Button
            className="menu-toggle"
            variant="ghost"
            size="icon"
            aria-label="切换导航"
            onClick={() => setMenu((v) => !v)}
          >
            {menu ? <X /> : <Menu />}
          </Button>
          <div>
            控制台 <span className="px-3">/</span> {section}
          </div>
          <div className="connection-status">
            <span className={api ? "connected-dot" : "disconnected-dot"} />
            {api ? "已连接" : "未连接"}
            <span className="server-label">
              {api ? new URL(base).host : ""}
            </span>
          </div>
        </header>
        <main>
          {!api ? (
            <Connection />
          ) : (
            <Suspense fallback={<Loading />}>
              <Routes>
                <Route path="/settings" element={<Connection />} />
                <Route
                  path="/sandboxes"
                  element={<ListPage key="sandboxes" kind="sandboxes" />}
                />
                <Route
                  path="/sandboxes/new"
                  element={<CreatePage key="create-sandbox" />}
                />
                <Route
                  path="/sandboxes/:id"
                  element={<DetailPage kind="sandboxes" />}
                />
                <Route
                  path="/snapshots"
                  element={<ListPage key="snapshots" kind="snapshots" />}
                />
                <Route
                  path="/snapshots/:id"
                  element={<DetailPage kind="snapshots" />}
                />
                <Route
                  path="/templates"
                  element={<ListPage key="templates" kind="templates" />}
                />
                <Route
                  path="/templates/new"
                  element={<CreatePage key="create-template" template />}
                />
                <Route
                  path="/templates/:id"
                  element={<DetailPage kind="templates" />}
                />
                <Route
                  path="/"
                  element={<Navigate to="/sandboxes" replace />}
                />
                <Route
                  path="*"
                  element={
                    <Heading
                      title="页面不存在"
                      description="请从左侧导航选择页面。"
                    />
                  }
                />
              </Routes>
            </Suspense>
          )}
        </main>
      </div>
      <Toaster richColors position="bottom-right" />
    </div>
  );
}
function LinkBrand() {
  return (
    <NavLink to="/sandboxes" className="brand">
      <Box />
      <span>
        <strong>OpenSandbox</strong>
        <small>Console</small>
      </span>
    </NavLink>
  );
}
class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    return this.state.error ? (
      <div className="p-8">
        <Failure error={this.state.error} />
        <Button className="mt-4" onClick={() => window.location.reload()}>
          重新加载
        </Button>
      </div>
    ) : (
      this.props.children
    );
  }
}
export default function RootApp(){return (
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <BrowserRouter basename="/console">
            <App />
          </BrowserRouter>
        </SessionProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>
);}

