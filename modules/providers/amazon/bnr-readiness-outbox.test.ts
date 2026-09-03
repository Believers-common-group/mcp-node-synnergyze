import { describe, expect, it } from "vitest";

import { resolveBnrReadinessV1 } from "../../bnr/readiness.ts";
import { AMAZON_BNR_NODE_001 } from "./bnr-node-001.ts";
import { buildAmazonBnrReadinessOutboxV1 } from "./bnr-readiness-outbox.ts";

const CHECKED_AT = "2026-08-23T05:55:00.000Z";

function proposedReadiness() {
  return resolveBnrReadinessV1({
    nodeRef: "BNR-001",
    partnerLifecycle: "PROPOSED_PARTNER",
    runtimeReadiness: "READY",
    authorityState: "EXTERNAL_UNRESOLVED",
    evidenceState: "UNRESOLVED",
    commercialState: "UNRESOLVED",
    requiredServicesResolved: true,
    wardenPolicyActive: true,
    riverOperational: false,
    registryDurable: true,
    activationEvidenceValid: false,
    suspended: false,
    readinessCheckedAt: CHECKED_AT,
  });
}

describe("Amazon BNR readiness Registry outbox", () => {
  it("builds a deterministic CWR Registry readiness event for BNR-001", () => {
    const first = buildAmazonBnrReadinessOutboxV1({
      manifest: AMAZON_BNR_NODE_001,
      readiness: proposedReadiness(),
      registryRevisionRef: "REGISTRY-REVISION:BNR-001:001",
    });
    const second = buildAmazonBnrReadinessOutboxV1({
      manifest: AMAZON_BNR_NODE_001,
      readiness: proposedReadiness(),
      registryRevisionRef: "REGISTRY-REVISION:BNR-001:001",
    });

    expect(first).toEqual(second);
    expect(first.sourceNodeCode).toBe("CWR-REGISTRY");
    expect(first.eventCode).toBe("BNR_NODE_READINESS_EVALUATED");
    expect(first.objectType).toBe("BNR_NODE");
    expect(first.objectCode).toBe("BNR-001");
    expect(first.registryRevisionRef).toBe("REGISTRY-REVISION:BNR-001:001");
    expect(first.eventReference).toMatch(/^REGISTRY-EVENT:BNR-001:[0-9a-f]{24}$/);
  });

  it("serializes readiness and evidence references without secrets or a fabricated River seal", () => {
    const event = buildAmazonBnrReadinessOutboxV1({
      manifest: {
        ...AMAZON_BNR_NODE_001,
        authorityEvidenceRefs: ["AUTHORITY-EVIDENCE:AMAZON:001"],
        commercialEvidenceRefs: ["COMMERCIAL-EVIDENCE:AMAZON:001"],
        technicalEvidenceRefs: ["TECHNICAL-EVIDENCE:AMAZON:001"],
      },
      readiness: proposedReadiness(),
      registryRevisionRef: "REGISTRY-REVISION:BNR-001:001",
    });

    expect(event.payload.partnerLifecycle).toBe("PROPOSED_PARTNER");
    expect(event.payload.activationState).toBe("INACTIVE");
    expect(event.payload.blockers).toContain("BNR_AUTHORITY_UNRESOLVED");
    expect(event.payload.authorityEvidenceRefs).toEqual(["AUTHORITY-EVIDENCE:AMAZON:001"]);
    expect(event.payload.riverSealClaimed).toBe(false);

    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain("refreshToken");
    expect(serialized).not.toContain("access_token");
    expect(serialized).not.toContain("client_secret");
    expect(serialized).not.toContain("sealRef");
  });

  it("keeps all-ready evidence ELIGIBLE when explicit activation evidence is absent", () => {
    const readiness = resolveBnrReadinessV1({
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
    });

    const event = buildAmazonBnrReadinessOutboxV1({
      manifest: AMAZON_BNR_NODE_001,
      readiness,
      registryRevisionRef: "REGISTRY-REVISION:BNR-001:002",
    });

    expect(event.payload.activationState).toBe("ELIGIBLE");
    expect(event.payload.riverSealClaimed).toBe(false);
  });
});
