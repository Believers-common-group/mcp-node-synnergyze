import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { scripts?: Record<string, string> };

describe("Node TypeScript runtime launchers", () => {
  it("uses transform-types for MCP start and Congress runtime validation", () => {
    const start = packageJson.scripts?.start ?? "";
    const validate = packageJson.scripts?.["validate:pestel:congress"] ?? "";

    expect(start).toContain("--experimental-transform-types");
    expect(validate).toContain("--experimental-transform-types");
    expect(start).not.toContain("--experimental-strip-types");
    expect(validate).not.toContain("--experimental-strip-types");
  });
});
