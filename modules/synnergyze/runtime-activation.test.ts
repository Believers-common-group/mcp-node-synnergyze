import { describe, expect, it } from "vitest";

import { assertProofReferenceIntegrityV1 } from "../proof/proof-reference.ts";
import { adaptRc1CausalTrace } from "../river/rc1-adapter.ts";
import type { WardenDecisionRequestV1 } from "../warden/contracts.ts";
import type { SyntheticWardenDecisionPolicyV1 } from "../warden/decision-service.ts";
import {
  SyntheticServiceRequestObservationSourceV1,
  type PostExecutionObservationSourceV1,
} from "./effect-verification.ts";
import type { ResolvedDeviceSecurityContextV1 } from "./contracts.ts";
import {
  SynnergyzeRuntimeActivationServiceV1,
  type RuntimeActivationTimelineV1,
  type SynnergyzeRuntimeActivationInputV1,
} from "./runtime-activation.ts";

const timeline: RuntimeActivationTimelineV1 = {
  decidedAt: "2026-09-12T05:11:00.000Z",
  reservedAt: "2026-09-12T05:11:00.000Z",
  checkedAt: "2026-09-12T05:12:00.000Z",
  executedAt: "2026-09-12T05:13:00.000Z",
  observedAt: "2026-09-12T05:14:00.000Z",
  verifiedAt: "2026-09-12T05:15:00.000Z",
};

function request(overrides: Partial<WardenDecisionRequestV1> = {}): WardenDecisionRequestV1 {
  return {
    requestRef: "WARDEN-REQUEST:RUNTIME-R01-001",
    actorRef: "DIGITALME-ALPHA-TEST-001",
    representedPrincipalRef: "LAB-COMPANY-001",
    actingCapacityRef: "CAPACITY:LAB-OPERATOR-001",
    contextRef: "ALPHA-NODE-001",
    programRef: "SYNNERGYZE-PROGRAM:RUNTIME-R01-001",
    eventRef: "SYNNERGYZE-EVENT:RUNTIME-R01-001",
    action: "service_request.create",
    capabilityRef: "service_request.create",
    targetRef: "SERVICE-REQUEST-TARGET:001",
    requestedEffect: "service_request.created",
    executionDeviceRef: "GENESIS-DEVICE-ALPHA-LG-001",
    genesisDevice: {
      resolutionRef: "GENESIS-DEVICE-RESOLUTION:runtime001",
      deviceRef: "GENESIS-DEVICE-ALPHA-LG-001",
      estateRef: "GENESIS-ESTATE-001",
      attestationRef: "GENESIS-DEVICE-ATTESTATION-RUNTIME-001",
      assuranceLevel: "L3",
      evidenceRefs: ["RIVER-DEVICE-EVIDENCE-RUNTIME-001"],
      resolvedAt: "2026-09-12T05:00:00.000Z",
      validUntil: "2026-09-12T06:00:00.000Z",
    },
    deviceSecurityState: "ACTIVE",
    deviceSecurityPolicyRef: "DEVICE-SECURITY-POLICY-001",
    deviceSecuritySourceRefs: [
      "DEVICE-SECURITY-RESOLUTION-001",
      "DEVICE-SECURITY-EVIDENCE-001",
    ],
    deviceSecurityResolvedAt: "2026-09-12T05:00:00.000Z",
    deviceSecurityValidUntil: "2026-09-12T06:00:00.000Z",
    authorityRefs: ["AUTHORITY:LAB-OPERATOR-001"],
    policyRefs: ["POLICY:ALPHA-SYNTHETIC-001"],
    representationSourceRefs: ["GENESIS-REPRESENTATION-001"],
    requestedAt: "2026-09-12T05:10:00.000Z",
    correlationId: "CORR:RUNTIME-R01-001",
    ...overrides,
  };
}

function policy(
  overrides: Partial<SyntheticWardenDecisionPolicyV1> = {},
): SyntheticWardenDecisionPolicyV1 {
  return {
    policySnapshotRef: "WARDEN-POLICY-SNAPSHOT:RUNTIME-R01-001",
    wardenRef: "WARDEN-ALPHA-CONFORMANCE-001",
    lifecycle: "ACTIVE",
    validFrom: "2026-09-12T05:00:00.000Z",
    validUntil: "2026-09-12T06:00:00.000Z",
    actorRef: "DIGITALME-ALPHA-TEST-001",
    representedPrincipalRef: "LAB-COMPANY-001",
    actingCapacityRef: "CAPACITY:LAB-OPERATOR-001",
    contextRef: "ALPHA-NODE-001",
    programRef: "SYNNERGYZE-PROGRAM:RUNTIME-R01-001",
    requiredAuthorityRefs: ["AUTHORITY:LAB-OPERATOR-001"],
    requiredPolicyRefs: ["POLICY:ALPHA-SYNTHETIC-001"],
    allowedCapabilityRefs: ["service_request.create"],
    manualReviewCapabilityRefs: ["contract.execute"],
    constraints: ["SYNTHETIC_CONFORMANCE_ONLY", "NO_EXTERNAL_EFFECT"],
    deviceRequirement: { required: true, minimumAssuranceLevel: "L2" },
    ...overrides,
  };
}

function executionDeviceSecurity(
  overrides: Partial<ResolvedDeviceSecurityContextV1> = {},
): ResolvedDeviceSecurityContextV1 {
  return {
    resolutionRef: "DEVICE-SECURITY-RESOLUTION-001",
    deviceRef: "GENESIS-DEVICE-ALPHA-LG-001",
    state: "ACTIVE",
    policyRef: "DEVICE-SECURITY-POLICY-001",
    evidenceRef: "DEVICE-SECURITY-EVIDENCE-001",
    assuranceLevel: "L3",
    resolvedAt: "2026-09-12T05:00:00.000Z",
    validUntil: "2026-09-12T06:00:00.000Z",
    ...overrides,
  };
}

function input(
  overrides: Partial<SynnergyzeRuntimeActivationInputV1> = {},
): SynnergyzeRuntimeActivationInputV1 {
  return {
    request: request(),
    policy: policy(),
    executionDeviceSecurity: executionDeviceSecurity(),
    estateScopeRef: "GENESIS-ESTATE-001",
    groupScopeRef: "GROUP:ALPHA-RUNTIME-QUALIFICATION-001",
    timeline,
    ...overrides,
  };
}

describe("SYNNERGYZE-RUNTIME-ACTIVATION-R0.1", () => {
  it("produces the complete device-bound proof chain only after terminal River seal", () => {
    const service = new SynnergyzeRuntimeActivationServiceV1();
    const result = service.execute(input());

    expect(result.state).toBe("CONTROLLED_ACTIVE_PROOF");
    expect(result.proofChain).toHaveLength(7);
    expect(result.proofChain.map((proof) => proof.proofFrom)).toEqual([
      "GENESIS",
      "SYNNERGYZE",
      "WARDEN",
      "RIVEROS",
      "SYNNERGYZE",
      "SYNNERGYZE",
      "RIVEROS",
    ]);
    expect(result.proofChain.map((proof) => proof.proofId)).toEqual([
      expect.stringMatching(/^E-GEN-DEVICE-[0-9A-F]{8}$/),
      expect.stringMatching(/^E-SYN-COMPOSE-[0-9A-F]{8}$/),
      expect.stringMatching(/^E-WAR-AUTH-[0-9A-F]{8}$/),
      expect.stringMatching(/^E-RIV-RESERVE-[0-9A-F]{8}$/),
      expect.stringMatching(/^E-SYN-EXEC-[0-9A-F]{8}$/),
      expect.stringMatching(/^E-SYN-VERIFY-[0-9A-F]{8}$/),
      expect.stringMatching(/^E-RIV-SEAL-[0-9A-F]{8}$/),
    ]);
    expect(result.compositeProof?.proofId).toMatch(/^G-RIV-RUNTIME-[0-9A-F]{8}$/);
    expect(result.compositeProof?.proofFrom).toBe("RIVEROS");
    for (const proof of [...result.proofChain, result.compositeProof!]) {
      expect(() => assertProofReferenceIntegrityV1(proof)).not.toThrow();
    }
    expect(result.externalEffects).toBe(false);
    expect(result.settlementFinality).toBe(false);
    expect(result.registryTruthPromoted).toBe(false);
    expect(service.adapterInvocationCount()).toBe(1);
  });

  it("blocks before Warden/River execution when Genesis device dependency is missing", () => {
    const service = new SynnergyzeRuntimeActivationServiceV1();
    const result = service.execute(input({ request: request({ genesisDevice: undefined }) }));

    expect(result.state).toBe("BLOCKED");
    expect(result.blockedReason).toBe("runtime_activation_genesis_device_required");
    expect(result.compositeProof).toBeUndefined();
    expect(service.adapterInvocationCount()).toBe(0);
  });

  it("blocks when transient execution security does not match the device-bound request", () => {
    const service = new SynnergyzeRuntimeActivationServiceV1();
    const result = service.execute(
      input({ executionDeviceSecurity: executionDeviceSecurity({ deviceRef: "GENESIS-DEVICE-OTHER" }) }),
    );

    expect(result.state).toBe("BLOCKED");
    expect(result.blockedReason).toBe("runtime_activation_device_security_mismatch");
    expect(result.compositeProof).toBeUndefined();
    expect(service.adapterInvocationCount()).toBe(0);
  });

  it("stops Warden DENY before River reservation, execution, verification or seal", () => {
    const service = new SynnergyzeRuntimeActivationServiceV1();
    const result = service.execute(
      input({
        request: request({ authorityRefs: [] }),
      }),
    );

    expect(result.state).toBe("BLOCKED");
    expect(result.blockedReason).toMatch(/^runtime_activation_warden_/);
    expect(result.proofChain.some((proof) => proof.proofFrom === "RIVEROS")).toBe(false);
    expect(result.compositeProof).toBeUndefined();
    expect(service.adapterInvocationCount()).toBe(0);
  });

  it("blocks River sealing when post-execution verification returns an exception", () => {
    const delegate = new SyntheticServiceRequestObservationSourceV1();
    const badObserver: PostExecutionObservationSourceV1 = {
      observerRef: "SYNTHETIC-MISMATCH-OBSERVER-001",
      observe(receipt, observedAt) {
        return {
          ...delegate.observe(receipt, observedAt),
          observerRef: this.observerRef,
          targetRef: "OTHER-TARGET",
        };
      },
    };
    const service = new SynnergyzeRuntimeActivationServiceV1({ observer: badObserver });
    const result = service.execute(input());

    expect(result.state).toBe("BLOCKED");
    expect(result.blockedReason).toBe("runtime_activation_effect_verification_exception");
    expect(result.proofChain.some((proof) => proof.proofType === "RIVER_SEAL")).toBe(false);
    expect(result.compositeProof).toBeUndefined();
    expect(service.adapterInvocationCount()).toBe(1);
  });

  it("blocks the composite proof when causal trace lineage is inconsistent", () => {
    const service = new SynnergyzeRuntimeActivationServiceV1({
      causalTraceFactory(correlationId, entries) {
        return {
          ...adaptRc1CausalTrace(correlationId, entries),
          sealRef: "RIVER-EVIDENCE-SEALED:OTHER",
        };
      },
    });
    const result = service.execute(input());

    expect(result.state).toBe("BLOCKED");
    expect(result.blockedReason).toBe("runtime_activation_causal_trace_mismatch");
    expect(result.compositeProof).toBeUndefined();
  });

  it("replays the exact request idempotently with stable Proof IDs and one adapter invocation", () => {
    const service = new SynnergyzeRuntimeActivationServiceV1();
    const first = service.execute(input());
    const second = service.execute(
      input({
        timeline: {
          decidedAt: "2026-09-12T05:20:00.000Z",
          reservedAt: "2026-09-12T05:20:00.000Z",
          checkedAt: "2026-09-12T05:21:00.000Z",
          executedAt: "2026-09-12T05:22:00.000Z",
          observedAt: "2026-09-12T05:23:00.000Z",
          verifiedAt: "2026-09-12T05:24:00.000Z",
        },
      }),
    );

    expect(second).toEqual(first);
    expect(second.proofChain.map((proof) => proof.proofId)).toEqual(
      first.proofChain.map((proof) => proof.proofId),
    );
    expect(second.compositeProof?.proofId).toBe(first.compositeProof?.proofId);
    expect(service.adapterInvocationCount()).toBe(1);
  });

  it("rejects mutated security context reusing the same request identity", () => {
    const service = new SynnergyzeRuntimeActivationServiceV1();
    service.execute(input());

    expect(() =>
      service.execute(
        input({
          executionDeviceSecurity: executionDeviceSecurity({
            resolutionRef: "DEVICE-SECURITY-RESOLUTION-002",
          }),
        }),
      ),
    ).toThrow("runtime_activation_replay_conflict");
    expect(service.adapterInvocationCount()).toBe(1);
  });
});
