import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { EstateConsoleSessionV1 } from "./contracts.ts";
import { EstateConsoleArtifactServiceV1 } from "./artifact-service.ts";

const roots: string[] = [];

function session(): EstateConsoleSessionV1 {
  return {
    sessionRef: "ESTATE-CONSOLE-SESSION:ARTIFACT-001",
    principalRef: "DIGITALME:TEST-001",
    deviceRef: "GENESIS-DEVICE:IPAD-TEST-001",
    consoleRef: "TEXTASTIC-IPAD-TEST-001",
    estateRef: "GENESIS-ESTATE-001",
    nodeRef: "ALPHA-NODE-001",
    profileRef: "ESTATE-CONSOLE-PROFILE:ENGINEERING-STAGING-V0.1",
    environment: "STAGING",
    capabilities: ["DISCOVER", "OBSERVE", "INSPECT", "SUBMIT"],
    state: "ACTIVE",
    admittedAt: "2026-09-14T08:00:00.000Z",
    validUntil: "2026-09-14T09:00:00.000Z",
    sourceRefs: ["REGISTRY:SESSION:ARTIFACT-001"],
    correlationId: "CORR:SESSION:ARTIFACT-001",
  };
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "estate-console-artifact-"));
  roots.push(root);
  const incoming = join(root, "incoming");
  mkdirSync(incoming);
  return {
    root,
    incoming,
    service: new EstateConsoleArtifactServiceV1({ ingressRoot: root, session: session() }),
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("Estate Console inert artifact ingress", () => {
  it("registers an uploaded file by immutable digest without moving or executing it", () => {
    const { incoming, service } = fixture();
    const path = join(incoming, "deployment.yaml");
    writeFileSync(path, "kind: EstateConsoleSmoke\nversion: v0.1\n");

    const artifact = service.registerIncoming("deployment.yaml", "application/yaml");

    expect(artifact.artifactRef).toMatch(/^ART:/);
    expect(artifact.sha256).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(artifact.state).toBe("REGISTERED");
    expect(readFileSync(path, "utf8")).toContain("EstateConsoleSmoke");
  });

  it("rejects traversal and absolute paths", () => {
    const { root, service } = fixture();
    writeFileSync(join(root, "escape.yaml"), "outside: true\n");

    expect(() => service.registerIncoming("../../escape.yaml", "application/yaml")).toThrow(
      "estate_console_artifact_path_outside_ingress",
    );
    expect(() => service.registerIncoming(join(root, "escape.yaml"), "application/yaml")).toThrow(
      "estate_console_artifact_absolute_path_denied",
    );
  });

  it("rejects a symlink inside incoming that resolves outside the ingress root", () => {
    const { root, incoming, service } = fixture();
    const outside = join(tmpdir(), `estate-console-outside-${Date.now()}.yaml`);
    roots.push(outside);
    writeFileSync(outside, "outside: true\n");
    symlinkSync(outside, join(incoming, "linked.yaml"));

    expect(() => service.registerIncoming("linked.yaml", "application/yaml")).toThrow(
      "estate_console_artifact_symlink_denied",
    );
    expect(root).not.toBe(outside);
  });

  it("rejects a file changed after registration before submission finalization", () => {
    const { incoming, service } = fixture();
    const path = join(incoming, "mutable.yaml");
    writeFileSync(path, "value: one\n");
    const artifact = service.registerIncoming("mutable.yaml", "application/yaml");

    writeFileSync(path, "value: two\n");

    expect(() => service.verifyForSubmission(artifact)).toThrow(
      "estate_console_artifact_digest_mismatch",
    );
  });

  it("returns the same artifact identity when an unchanged registered file is verified", () => {
    const { incoming, service } = fixture();
    writeFileSync(join(incoming, "stable.json"), '{"ok":true}\n');
    const artifact = service.registerIncoming("stable.json", "application/json");

    const verified = service.verifyForSubmission(artifact);

    expect(verified.artifactRef).toBe(artifact.artifactRef);
    expect(verified.sha256).toBe(artifact.sha256);
    expect(verified.state).toBe("REGISTERED");
  });
});
