import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const manifest = readFileSync(
  new URL("../../.vsr/repository-components.yaml", import.meta.url),
  "utf8",
);
const packageJson = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
) as { scripts?: Record<string, string> };

const componentIds = [
  "CMP-SYNNERGYZE-EFFECT-EXPECTATION-001",
  "CMP-SYNNERGYZE-EXCEPTION-FABRIC-001",
  "CMP-SYNNERGYZE-RECONCILIATION-FABRIC-001",
  "CMP-SYNNERGYZE-REMEDY-AUTH-001",
  "CMP-SYNNERGYZE-REMEDY-JOURNAL-001",
  "CMP-SYNNERGYZE-REMEDY-RUNTIME-001",
] as const;

describe("WARDEN-ALPHA-REFERENCE-0.5.1 evidence registration", () => {
  it("registers every reconciliation, exception and remedy component without implying activation", () => {
    for (const componentId of componentIds) {
      const start = manifest.indexOf(`  - component_id: ${componentId}`);
      expect(start, `missing component ${componentId}`).toBeGreaterThanOrEqual(0);
      const next = manifest.indexOf("\n  - component_id:", start + 1);
      const block = manifest.slice(start, next === -1 ? undefined : next);
      expect(block).toContain("state: conformance_implemented");
      expect(block).toContain("activation_implied: false");
    }
  });

  it("exposes focused reconciliation and remedy verification commands", () => {
    expect(packageJson.scripts?.["test:reconciliation"]).toBe(
      "vitest run modules/synnergyze/effect-expectation.test.ts modules/synnergyze/exception-fabric.test.ts modules/synnergyze/reconciliation-fabric.test.ts modules/synnergyze/reconciliation-expectation.test.ts",
    );
    expect(packageJson.scripts?.["test:remedy-runtime"]).toBe(
      "vitest run modules/synnergyze/remedy-authorization.test.ts modules/synnergyze/remedy-execution.test.ts modules/synnergyze/remedy-runtime.test.ts",
    );
  });
});
