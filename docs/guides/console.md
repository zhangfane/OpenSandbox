---
title: Console
description: Manage sandbox lifecycles through the OpenSandbox web console.
---

# Console

OpenSandbox Console is a Chinese-language React application served by the lifecycle server at `/console/`. It manages sandboxes, snapshots, templates, network policies and diagnostic snapshots using the existing API and tenant permissions.

## Connect

Open `http://localhost:8080/console/` and enter your server API key. The default API address is the same server's `/v1`. An alternative server must allow browser requests and use HTTPS when the console is served over HTTPS. Keys remain in memory only: reload requires reconnecting. Disconnecting clears cached server data.

The console does not add accounts or roles. Templates require a supported Kubernetes deployment. Other runtime-specific features report server errors explicitly. Diagnostic logs are snapshots, not live streams or an audit history. Secured endpoints may require headers; copy the displayed request instead of opening the URL directly.

## Manage sandboxes

Use **创建沙箱** to select an image, snapshot, successful template or existing Pool reference. The five steps expose creation parameters as forms, including resources, expiry, volumes, networking and lifecycle hooks. Switching startup mode clears incompatible settings. The default TTL is one hour; manual cleanup is subject to runtime support.

The list supports exact name matching, metadata filtering and server pagination. Details provide pause/resume, renewal, snapshots, metadata edits, endpoint access and diagnostics. Accepted operations are followed by polling; the UI only reports completion when the server confirms it. Deletion requires confirmation.

## Development

Requires Node.js 22.12+ and pnpm 9.15.0.

```sh
cd console
pnpm install --frozen-lockfile
pnpm dev
```

Open the printed development URL under `/console/`. The development server proxies `/v1` to `http://127.0.0.1:8080`; set `CONSOLE_DEV_SERVER` to change the proxy target. Run the lifecycle server separately using its normal configuration.

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm build:server
```

`build:server` stages assets under the Python package for server hosting. Generated assets are ignored by Git. API types are generated from the repository lifecycle and diagnostic specifications with `pnpm gen:api`.

## Packaging

Before building a server wheel, source distribution or a Docker image directly, stage console assets:

```sh
pnpm --dir console install --frozen-lockfile
pnpm --dir console build:server
cd server
uv build
# Or build the image locally (does not publish):
docker build -t opensandbox-server-local .
```

The server release workflow and `server/build.sh` stage the console before packaging. Node.js is only a build dependency. The production server does not require a JavaScript runtime. Source-only API development remains possible without assets; `/console/` then explains that the console has not been built.

Console pages are public static files; all business API requests retain API-key authentication. `/console/` does not expose server configuration or embed credentials.
