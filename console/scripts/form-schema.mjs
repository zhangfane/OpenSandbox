import { readFile, writeFile, mkdir } from "node:fs/promises";
import YAML from "yaml";
const spec = YAML.parse(
  await readFile(
    new URL("../../specs/sandbox-lifecycle.yml", import.meta.url),
    "utf8",
  ),
);
function expand(node) {
  if (Array.isArray(node)) return node.map(expand);
  if (!node || typeof node !== "object") return node;
  if (node.$ref)
    return expand({
      ...spec.components.schemas[node.$ref.split("/").at(-1)],
      ...Object.fromEntries(Object.entries(node).filter(([k]) => k !== "$ref")),
    });
  return Object.fromEntries(
    Object.entries(node)
      .filter(([k]) => !["description", "example", "examples"].includes(k))
      .map(([k, v]) => [k, expand(v)]),
  );
}
await mkdir(new URL("../src/api/", import.meta.url), { recursive: true });
await writeFile(
  new URL("../src/api/forms.gen.json", import.meta.url),
  JSON.stringify(
    Object.fromEntries(
      ["CreateSandboxRequest", "CreateFsbTemplateRequest", "NetworkPolicy"].map(
        (k) => [k, expand(spec.components.schemas[k])],
      ),
    ),
    null,
    2,
  ) + "\n",
);
