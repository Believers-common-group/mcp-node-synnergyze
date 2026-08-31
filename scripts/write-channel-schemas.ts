import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { channelSchemas } from "../modules/channels/schema-definitions.ts";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, canonicalize((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

const here = dirname(fileURLToPath(import.meta.url));
const target = resolve(here, "../modules/channels/schemas");
mkdirSync(target, { recursive: true });

for (const [name, schema] of Object.entries(channelSchemas)) {
  const path = resolve(target, name);
  if (existsSync(path)) {
    const current = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (JSON.stringify(canonicalize(current)) === JSON.stringify(canonicalize(schema))) continue;
  }
  writeFileSync(path, `${JSON.stringify(schema, null, 2)}\n`, "utf8");
}
