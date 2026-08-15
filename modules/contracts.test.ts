import { describe, expect, it } from "vitest";

import type { BnrReadinessStateV1 } from "./bnr/contracts.ts";
import type { NormalizedIntentV1 } from "./qel/contracts.ts";
import type { EvidenceSealV1 } from "./river/contracts.ts";
import type { EconomicConsequenceDraftV1 } from "./silk-dam/contracts.ts";
import type { SettlementStateV1 } from "./silk/contracts.ts";
import type { WardenDecisionV1 } from "./warden/contracts.ts";

const allowDecision: WardenDecisionV1 = {
  decisionRef: "WARDEN-DECISION-001",
  requestRef: "REQUEST-001",
  wardenRef: "WARDEN-ALPHA-RC1-001",
  decision: "ALLOW",
  action: "service_request.create",
  targetRef: "SERVICE-REQUEST-001",
  reasonCodes: ["POLICY_MATCH"],
  constraints: ["SYNTHETIC_ONLY"],
  decidedAt: "2026-08-14T00:00:00Z",
  correlationId: "CORR-001",
  actionToken: "ACTION-TOKEN-001",
};

// @ts-expect-error A denied decision cannot carry an executable action token.
const invalidDeniedDecision: WardenDecisionV1 = {
  ...allowDecision,
  decision: "DENY",
  actionToken: "FORBIDDEN-TOKEN",
};
void invalidDeniedDecision;

const normalizedIntent: NormalizedIntentV1 = {
  intentRef: "INTENT-001",
  actorRef: "DIGITALME-ALPHA-TEST-001",
  contextRef: "ALPHA-NODE-001",
  action: "service_request.create",
  authorityState: "UNRESOLVED",
  authorized: false,
  sourceExpressionRef: "QEL-EXPR-001",
  correlationId: "CORR-001",
};

const invalidAuthorizedIntent: NormalizedIntentV1 = {
  ...normalizedIntent,
  // @ts-expect-error QEL normalization cannot mark an intent authorized.
  authorized: true,
};
void invalidAuthorizedIntent;

const evidenceSeal: EvidenceSealV1 = {
  sealRef: "SEAL-001",
  reservationRef: "RES-001",
  correlationId: "CORR-001",
  state: "SEALED",
  traceDigest: "sha256:trace",
  sealedAt: "2026-08-14T00:01:00Z",
};

const readiness: BnrReadinessStateV1 = {
  nodeRef: "ALPHA-NODE-001",
  runtimeReadiness: "READY",
  authorityState: "EXTERNAL_EVIDENCED",
  evidenceState: "READY",
  blockers: [],
  readinessCheckedAt: "2026-08-14T00:02:00Z",
};

const economicDraft: EconomicConsequenceDraftV1 = {
  consequenceRef: "ECON-001",
  economicEffectRef: "EFFECT-001",
  policyRef: "POLICY-001",
  state: "REQUIRES_AUTHORIZATION",
  modelledAmounts: [{ amountMinor: 1000n, currency: "INR" }],
  obligationRefs: [],
  settlementFinality: false,
  correlationId: "CORR-001",
};

const invalidEconomicFinality: EconomicConsequenceDraftV1 = {
  ...economicDraft,
  // @ts-expect-error SILK Dam cannot declare settlement finality.
  settlementFinality: true,
};
void invalidEconomicFinality;

const finalSettlement: SettlementStateV1 = {
  settlementIntentRef: "SETTLEMENT-INTENT-001",
  obligationRef: "OBLIGATION-001",
  correlationId: "CORR-001",
  updatedAt: "2026-08-14T00:03:00Z",
  state: "FINAL",
  settlementFinality: true,
  providerReceiptRef: "PROVIDER-RECEIPT-001",
  reconciliationRef: "RECON-001",
  finalityEvidenceRef: "FINALITY-EVIDENCE-001",
};

// @ts-expect-error FINAL requires explicit finality semantics, not a non-final state shape.
const invalidFinalSettlement: SettlementStateV1 = {
  settlementIntentRef: "SETTLEMENT-INTENT-002",
  obligationRef: "OBLIGATION-002",
  correlationId: "CORR-002",
  updatedAt: "2026-08-14T00:04:00Z",
  state: "FINAL",
  settlementFinality: false,
};
void invalidFinalSettlement;

describe("VSR network contract types", () => {
  it("keeps authorization outside QEL and inside an explicit Warden allow decision", () => {
    expect(normalizedIntent.authorized).toBe(false);
    expect(normalizedIntent.authorityState).toBe("UNRESOLVED");
    expect(allowDecision.decision).toBe("ALLOW");
    expect(allowDecision.actionToken).toBe("ACTION-TOKEN-001");
  });

  it("keeps node readiness separate from authority and evidence state", () => {
    expect(readiness.runtimeReadiness).toBe("READY");
    expect(readiness.authorityState).toBe("EXTERNAL_EVIDENCED");
    expect(readiness.evidenceState).toBe("READY");
  });

  it("keeps River sealing and economic interpretation distinct from settlement finality", () => {
    expect(evidenceSeal.state).toBe("SEALED");
    expect(economicDraft.settlementFinality).toBe(false);
    expect(finalSettlement.state).toBe("FINAL");
    expect(finalSettlement.settlementFinality).toBe(true);
    expect(finalSettlement.finalityEvidenceRef).toBe("FINALITY-EVIDENCE-001");
  });
});
