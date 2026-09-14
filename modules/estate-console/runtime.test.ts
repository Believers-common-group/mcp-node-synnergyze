import { describe, expect, it } from "vitest";

import type { WardenDecisionRequestV1, WardenDecisionV1 } from "../warden/contracts.ts";
import type {
  EstateArtifactV1,
  EstateConsoleSessionV1,
  EstateReceiptProjectionV1,
} from "./contracts.ts";
import type { ConsoleReceiptPortV1 } from "./receipt-adapter.ts";
import {
  EstateConsoleRuntimeV1,
  type EstateArtifactSubmissionPortV1,
  type EstateConsoleWardenPortV1,
} from "./runtime.ts";

function session(capabilities: EstateConsoleSessionV1["capabilities"] = ["SUBMIT"]): EstateConsoleSessionV1 {
  return {
    sessionRef: "ESTATE-CONSOLE-SESSION:RUNTIME-001",
    principalRef: "DIGITALME:TEST-001",
    deviceRef: "GENESIS-DEVICE:IPAD-TEST-001",
    consoleRef: "TEXTASTIC-IPAD-TEST-001",
    estateRef: "GENESIS-ESTATE-001",
    nodeRef: "ALPHA-NODE-001",
    profileRef: "ESTATE-CONSOLE-PROFILE:ENGINEERING-STAGING-V0.1",
    environment: "STAGING",
    capabilities,
    state: "ACTIVE",
    admittedAt: "2026-09-14T08:00:00Z",
    validUntil: "2026-09-14T09:00:00Z",
    sourceRefs: ["REGISTRY:SESSION:RUNTIME-001"],
    correlationId: "CORR:RUNTIME:SESSION-001",
  };
}

function artifact(): EstateArtifactV1 {
  return {
    artifactRef: "ART:TEST-001",
    sessionRef: "ESTATE-CONSOLE-SESSION:RUNTIME-001",
    principalRef: "DIGITALME:TEST-001",
    deviceRef: "GENESIS-DEVICE:IPAD-TEST-001",
    consoleRef: "TEXTASTIC-IPAD-TEST-001",
    filename: "deployment.yaml",
    mediaType: "application/yaml",
    sha256: `sha256:${"a".repeat(64)}`,
    sizeBytes: 42,
    state: "REGISTERED",
    sourceRefs: ["ESTATE-CONSOLE-SESSION:RUNTIME-001"],
    correlationId: "CORR:RUNTIME:ARTIFACT-001",
  };
}

function decision(request: WardenDecisionRequestV1, outcome: "ALLOW" | "DENY" | "ESCALATE"): WardenDecisionV1 {
  const base = {
    decisionRef: `WARDEN-DECISION:${outcome}`,
    requestRef: request.requestRef,
    wardenRef: "WARDEN:TEST",
    action: request.action,
    targetRef: request.targetRef,
    reasonCodes: [outcome === "ALLOW" ? "bounded_policy_allow" : "test_non_allow"],
    constraints: ["NO_EXTERNAL_EFFECT"],
    decidedAt: "2026-09-14T08:50:01Z",
    validUntil: "2026-09-14T08:55:00Z",
    correlationId: request.correlationId,
  } as const;
  return outcome === "ALLOW"
    ? { ...base, decision: "ALLOW", actionToken: "WARDEN-ACTION-TOKEN:UNUSED-BY-CONSOLE" }
    : { ...base, decision: outcome };
}

function harness(outcome: "ALLOW" | "DENY" | "ESCALATE" = "ALLOW") {
  const calls: string[] = [];
  const stored = new Map<string, EstateReceiptProjectionV1>();
  const receipts: ConsoleReceiptPortV1 = {
    reserve: (input) => {
      calls.push("river.reserve");
      const value: EstateReceiptProjectionV1 = {
        receiptRef: "RIVER-CONSOLE-RECEIPT:RUNTIME-001",
        sessionRef: input.sessionRef,
        correlationId: input.correlationId,
        actionClass: input.actionClass,
        state: "RESERVED",
        recordedAt: input.reservedAt,
        reasonCodes: [],
      };
      stored.set(value.receiptRef, value);
      return value;
    },
    recordRead: (input) => stored.get(input.receiptRef)!,
    recordAuthorizedProposal: (input) => {
      calls.push("river.authorized");
      const value = { ...stored.get(input.receiptRef)!, state: "AUTHORIZED" as const, wardenDecisionRef: input.wardenDecisionRef };
      stored.set(input.receiptRef, value);
      return value;
    },
    recordDeniedProposal: (input) => {
      calls.push("river.denied");
      const value = { ...stored.get(input.receiptRef)!, state: "DENIED" as const, wardenDecisionRef: input.wardenDecisionRef };
      stored.set(input.receiptRef, value);
      return value;
    },
    recordHeldProposal: (input) => {
      calls.push("river.held");
      const value = { ...stored.get(input.receiptRef)!, state: "HELD_FOR_REVIEW" as const, wardenDecisionRef: input.wardenDecisionRef };
      stored.set(input.receiptRef, value);
      return value;
    },
    recordRejected: (input) => {
      calls.push("river.rejected");
      const value = { ...stored.get(input.receiptRef)!, state: "REJECTED" as const, reasonCodes: input.reasonCodes };
      stored.set(input.receiptRef, value);
      return value;
    },
    get: (receiptRef) => stored.get(receiptRef),
  };
  const artifacts: EstateArtifactSubmissionPortV1 = {
    verifyForSubmission: (value) => {
      calls.push("artifact.verify");
      return value;
    },
  };
  const warden: EstateConsoleWardenPortV1 = {
    evaluate: (request) => {
      calls.push("warden.evaluate");
      return decision(request, outcome);
    },
  };
  const runtime = new EstateConsoleRuntimeV1({
    session: session(),
    artifacts,
    receipts,
    warden,
    authorityContext: {
      representedPrincipalRef: "ESTATE:TEST-001",
      actingCapacityRef: "CAPACITY:ESTATE-ENGINEER-001",
      contextRef: "ALPHA-NODE-001",
      programRef: "ESTATE-CONSOLE-PROGRAM:G0",
      authorityRefs: ["AUTHORITY:ESTATE-CONSOLE:G0"],
      policyRefs: ["POLICY:ESTATE-CONSOLE:G0"],
      representationSourceRefs: ["REGISTRY:REPRESENTATION:TEST-001"],
    },
  });
  return { runtime, calls, receipts, warden };
}

describe("Estate Console G0 runtime", () => {
  it("requires SUBMIT capability before artifact, River, or Warden work", () => {
    const target = harness();
    const runtime = new EstateConsoleRuntimeV1({
      ...target.runtime.dependencies(),
      session: session(["DISCOVER", "OBSERVE", "INSPECT"]),
    });

    expect(() => runtime.submit(artifact(), "2026-09-14T08:50:00Z")).toThrow(
      "estate_console_submit_capability_required",
    );
    expect(target.calls).toEqual([]);
  });

  it("orders verify -> River reserve -> Warden -> River authorization and never executes", () => {
    const target = harness("ALLOW");
    const result = target.runtime.submit(artifact(), "2026-09-14T08:50:00Z");

    expect(target.calls).toEqual([
      "artifact.verify",
      "river.reserve",
      "warden.evaluate",
      "river.authorized",
    ]);
    expect(result.artifact.state).toBe("AUTHORIZED_PROPOSAL");
    expect(result.receipt.state).toBe("AUTHORIZED");
    expect(result.executed).toBe(false);
  });

  it.each([
    ["DENY", "DENIED", "river.denied"],
    ["ESCALATE", "HELD_FOR_REVIEW", "river.held"],
  ] as const)("maps Warden %s into non-effect proposal state %s", (outcome, state, riverCall) => {
    const target = harness(outcome);
    const result = target.runtime.submit(artifact(), "2026-09-14T08:50:00Z");

    expect(result.artifact.state).toBe(state);
    expect(result.executed).toBe(false);
    expect(target.calls.at(-1)).toBe(riverCall);
  });

  it("fails closed and records rejection when Warden is unavailable", () => {
    const target = harness();
    const runtime = new EstateConsoleRuntimeV1({
      ...target.runtime.dependencies(),
      warden: { evaluate: () => { target.calls.push("warden.evaluate"); throw new Error("offline"); } },
    });

    expect(() => runtime.submit(artifact(), "2026-09-14T08:50:00Z")).toThrow(
      "estate_console_warden_unavailable",
    );
    expect(target.calls).toEqual([
      "artifact.verify",
      "river.reserve",
      "warden.evaluate",
      "river.rejected",
    ]);
  });

  it("does not call Warden when River reservation is unavailable", () => {
    const target = harness();
    const runtime = new EstateConsoleRuntimeV1({
      ...target.runtime.dependencies(),
      receipts: { ...target.receipts, reserve: () => { target.calls.push("river.reserve"); throw new Error("offline"); } },
    });

    expect(() => runtime.submit(artifact(), "2026-09-14T08:50:00Z")).toThrow(
      "estate_console_river_unavailable",
    );
    expect(target.calls).toEqual(["artifact.verify", "river.reserve"]);
  });

  it("constructs only the Type B estate.artifact.submit Warden request", () => {
    const target = harness();
    let captured: WardenDecisionRequestV1 | undefined;
    const runtime = new EstateConsoleRuntimeV1({
      ...target.runtime.dependencies(),
      warden: { evaluate: (request) => { captured = request; return decision(request, "ALLOW"); } },
    });

    runtime.submit(artifact(), "2026-09-14T08:50:00Z");

    expect(captured?.action).toBe("estate.artifact.submit");
    expect(captured?.capabilityRef).toBe("estate.artifact.submit");
    expect(captured?.requestedEffect).toBeUndefined();
    expect("executionDeviceRef" in (captured ?? {})).toBe(false);
  });
});
