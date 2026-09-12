import { cp, mkdir, rm, access } from "node:fs/promises";
const source = new URL("../dist/", import.meta.url);
const target = new URL(
  "../../server/opensandbox_server/static/console/",
  import.meta.url,
);
await access(new URL("index.html", source));
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(source, target, { recursive: true });
console.log("Console staged in the server package");
