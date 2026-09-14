import { describe, expect, it } from "vitest";

import type { EstateArtifactV1, EstateConsoleSessionV1, EstateReceiptProjectionV1 } from "../../modules/estate-console/contracts.ts";
import { runEstateCommandV1, type EstateCommandRunnerDependenciesV1 } from "./estate.ts";

function session(): EstateConsoleSessionV1 {
  return {
    sessionRef: "ESTATE-CONSOLE-SESSION:CLI-001",
    principalRef: "DIGITALME:TEST-001",
    deviceRef: "GENESIS-DEVICE:IPAD-TEST-001",
    consoleRef: "TEXTASTIC-IPAD-TEST-001",
    estateRef: "GENESIS-ESTATE-001",
    nodeRef: "ALPHA-NODE-001",
    profileRef: "ESTATE-CONSOLE-PROFILE:ENGINEERING-STAGING-V0.1",
    environment: "STAGING",
    capabilities: ["DISCOVER", "OBSERVE", "INSPECT", "SUBMIT"],
    state: "ACTIVE",
    admittedAt: "2026-09-14T08:00:00Z",
    validUntil: "2026-09-14T09:00:00Z",
    sourceRefs: ["REGISTRY:SESSION:CLI-001"],
    correlationId: "CORR:CLI:SESSION-001",
  };
}

function receipt(sessionRef = "ESTATE-CONSOLE-SESSION:CLI-001"): EstateReceiptProjectionV1 {
  return {
    receiptRef: "RIVER-CONSOLE-RECEIPT:CLI-001",
    sessionRef,
    correlationId: "CORR:CLI:RECEIPT-001",
    actionClass: "READ",
    state: "RECORDED",
    recordedAt: "2026-09-14T08:45:00Z",
    reasonCodes: ["bounded_read_recorded"],
  };
}

function dependencies() {
  const calls: string[] = [];
  const artifact: EstateArtifactV1 = {
    artifactRef: "ART:CLI-001",
    sessionRef: session().sessionRef,
    principalRef: session().principalRef,
    deviceRef: session().deviceRef,
    consoleRef: session().consoleRef,
    filename: "deployment.yaml",
    mediaType: "application/yaml",
    sha256: `sha256:${"b".repeat(64)}`,
    sizeBytes: 42,
    state: "REGISTERED",
    sourceRefs: [session().sessionRef],
    correlationId: "CORR:CLI:ARTIFACT-001",
  };
  const deps: EstateCommandRunnerDependenciesV1 = {
    session: session(),
    inspection: {
      status: () => { calls.push("status"); return [{ probeRef: "PROBE:RIVER", resourceRef: "river", health: "HEALTHY", observedAt: "2026-09-14T08:45:00Z", data: {}, sourceRefs: [] }]; },
      health: () => { calls.push("health"); return "HEALTHY"; },
      inspect: (resourceRef) => { calls.push(`inspect:${resourceRef}`); return { probeRef: "PROBE:RIVER", resourceRef, health: "HEALTHY", observedAt: "2026-09-14T08:45:00Z", data: { receipts: 1 }, sourceRefs: [] }; },
    },
    artifacts: {
      registerIncoming: (filename, mediaType) => { calls.push(`register:${filename}:${mediaType}`); return artifact; },
    },
    runtime: {
      submit: (value) => { calls.push(`submit:${value.artifactRef}`); return { artifact: { ...value, state: "AUTHORIZED_PROPOSAL" }, receipt: receipt(), wardenDecision: {} as never, executed: false as const }; },
    },
    receiptQuery: {
      list: () => [receipt(), receipt("ESTATE-CONSOLE-SESSION:OTHER")],
      get: () => receipt(),
    },
    now: () => "2026-09-14T08:45:00Z",
  };
  return { deps, calls };
}

describe("Estate Console CLI runner", () => {
  it("whoami returns the exact principal/device/console/session tuple", () => {
    const { deps } = dependencies();
    const result = runEstateCommandV1("estate whoami", deps);

    expect(result.exitCode).toBe(0);
    expect(result.data).toEqual({
      principalRef: "DIGITALME:TEST-001",
      deviceRef: "GENESIS-DEVICE:IPAD-TEST-001",
      consoleRef: "TEXTASTIC-IPAD-TEST-001",
      sessionRef: "ESTATE-CONSOLE-SESSION:CLI-001",
      nodeRef: "ALPHA-NODE-001",
      environment: "STAGING",
      capabilities: ["DISCOVER", "OBSERVE", "INSPECT", "SUBMIT"],
    });
  });

  it("routes bounded read commands to inspection only", () => {
    const target = dependencies();
    expect(runEstateCommandV1("estate status", target.deps).exitCode).toBe(0);
    expect(runEstateCommandV1("estate health", target.deps).exitCode).toBe(0);
    expect(runEstateCommandV1("estate inspect river", target.deps).exitCode).toBe(0);
    expect(target.calls).toEqual(["status", "health", "inspect:river"]);
  });

  it("registers an ingress artifact then delegates submit to the governed runtime", () => {
    const target = dependencies();
    const result = runEstateCommandV1("estate submit deployment.yaml", target.deps);

    expect(result.exitCode).toBe(0);
    expect(target.calls).toEqual([
      "register:deployment.yaml:application/yaml",
      "submit:ART:CLI-001",
    ]);
  });

  it("lists only receipts owned by the current session", () => {
    const target = dependencies();
    const result = runEstateCommandV1("estate receipts", target.deps);

    expect(result.exitCode).toBe(0);
    expect(result.data).toHaveLength(1);
    expect((result.data as EstateReceiptProjectionV1[])[0]?.sessionRef).toBe(target.deps.session.sessionRef);
  });

  it("hides a receipt belonging to another session", () => {
    const target = dependencies();
    target.deps.receiptQuery.get = () => receipt("ESTATE-CONSOLE-SESSION:OTHER");
    const result = runEstateCommandV1("estate receipt RIVER-CONSOLE-RECEIPT:CLI-001", target.deps);

    expect(result.exitCode).not.toBe(0);
    expect(result.errorCode).toBe("estate_console_receipt_not_visible");
  });

  it("returns non-zero for commands outside the closed grammar", () => {
    const target = dependencies();
    const result = runEstateCommandV1("docker ps", target.deps);

    expect(result.exitCode).not.toBe(0);
    expect(result.errorCode).toBe("estate_console_command_not_allowed");
    expect(target.calls).toEqual([]);
  });
});
