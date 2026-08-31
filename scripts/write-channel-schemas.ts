import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { channelSchemas } from "../modules/channels/schema-definitions.ts";

const here = dirname(fileURLToPath(import.meta.url));
const target = resolve(here, "../modules/channels/schemas");
mkdirSync(target, { recursive: true });

for (const [name, schema] of Object.entries(channelSchemas)) {
  const path = resolve(target, name);
  if (existsSync(path)) {
    const current = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (JSON.stringify(current) === JSON.stringify(schema)) continue;
  }
  writeFileSync(path, `${JSON.stringify(schema, null, 2)}\n`, "utf8");
}
