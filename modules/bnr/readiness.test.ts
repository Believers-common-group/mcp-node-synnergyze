import { describe, expect, it } from "vitest";

import { resolveBnrReadinessV1 } from "./readiness.ts";
import type { BnrActivationInputsV1 } from "./contracts.ts";

const CHECKED_AT = "2026-08-23T05:30:00.000Z";

function allReady(overrides: Partial<BnrActivationInputsV1> = {}): BnrActivationInputsV1 {
  return {
    nodeRef: "BNR-001",
    partnerLifecycle: "TECHNICALLY_READY",
    runtimeReadiness: "READY",
    authorityState: "EXTERNAL_EVIDENCED",
    evidenceState: "READY",
    commercialState: "EVIDENCED",
    requiredServicesResolved: true,
    wardenPolicyActive: true,
    riverOperational: true,
    registryDurable: true,
    activationEvidenceValid: false,
    suspended: false,
    readinessCheckedAt: CHECKED_AT,
    ...overrides,
  };
}

describe("BNR readiness activation model", () => {
  it("keeps a proposed partner inactive and exposes deterministic blockers", () => {
    const result = resolveBnrReadinessV1({
      nodeRef: "BNR-001",
      partnerLifecycle: "PROPOSED_PARTNER",
      runtimeReadiness: "BLOCKED",
      authorityState: "EXTERNAL_UNRESOLVED",
      evidenceState: "UNRESOLVED",
      commercialState: "UNRESOLVED",
      requiredServicesResolved: false,
      wardenPolicyActive: false,
      riverOperational: false,
      registryDurable: false,
      activationEvidenceValid: false,
      suspended: false,
      readinessCheckedAt: CHECKED_AT,
    });

    expect(result.activationState).toBe("INACTIVE");
    expect(result.blockers).toEqual([
      "BNR_PARTNER_NOT_TECHNICALLY_READY",
      "BNR_RUNTIME_BLOCKED",
      "BNR_AUTHORITY_UNRESOLVED",
      "BNR_EVIDENCE_UNREADY",
      "BNR_COMMERCIAL_UNRESOLVED",
      "BNR_REQUIRED_SERVICES_UNRESOLVED",
      "BNR_WARDEN_POLICY_INACTIVE",
      "BNR_RIVER_UNREADY",
      "BNR_REGISTRY_NOT_DURABLE",
    ]);
  });

  it("resolves eligible only when every readiness prerequisite is satisfied", () => {
    const result = resolveBnrReadinessV1(allReady());

    expect(result.partnerLifecycle).toBe("TECHNICALLY_READY");
    expect(result.activationState).toBe("ELIGIBLE");
    expect(result.blockers).toEqual([]);
  });

  it("requires explicit valid activation evidence for ACTIVE", () => {
    const result = resolveBnrReadinessV1(allReady({ activationEvidenceValid: true }));

    expect(result.activationState).toBe("ACTIVE");
    expect(result.blockers).toEqual([]);
  });

  it("keeps activation inactive when any single authority, commercial, River, Registry, policy, or service prerequisite is missing", () => {
    const cases: Array<[Partial<BnrActivationInputsV1>, string]> = [
      [{ authorityState: "EXTERNAL_UNRESOLVED" }, "BNR_AUTHORITY_UNRESOLVED"],
      [{ commercialState: "UNRESOLVED" }, "BNR_COMMERCIAL_UNRESOLVED"],
      [{ evidenceState: "UNRESOLVED" }, "BNR_EVIDENCE_UNREADY"],
      [{ riverOperational: false }, "BNR_RIVER_UNREADY"],
      [{ registryDurable: false }, "BNR_REGISTRY_NOT_DURABLE"],
      [{ wardenPolicyActive: false }, "BNR_WARDEN_POLICY_INACTIVE"],
      [{ requiredServicesResolved: false }, "BNR_REQUIRED_SERVICES_UNRESOLVED"],
    ];

    for (const [overrides, blocker] of cases) {
      const result = resolveBnrReadinessV1(allReady({ ...overrides, activationEvidenceValid: true }));
      expect(result.activationState).toBe("INACTIVE");
      expect(result.blockers).toContain(blocker);
    }
  });

  it("resolves SUSPENDED before ACTIVE and requires re-evaluation to reactivate", () => {
    const suspended = resolveBnrReadinessV1(
      allReady({ activationEvidenceValid: true, suspended: true }),
    );
    expect(suspended.activationState).toBe("SUSPENDED");

    const reEvaluated = resolveBnrReadinessV1(
      allReady({ activationEvidenceValid: true, suspended: false }),
    );
    expect(reEvaluated.activationState).toBe("ACTIVE");
  });
});
