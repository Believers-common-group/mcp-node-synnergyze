import type { SyntheticCircularPassportSnapshotV01 } from "./circular-passport-fixture.ts";
import {
  bindRiverVerifiedOutcomeV01,
  VSR_QEL_CORE_CONTRACT_VERSION,
  type QelAuthorityStateV01,
  type QelOperationalFrameV01,
  type QelRiverVerificationReceiptV01,
} from "./operational-contracts.ts";
import { buildQelPodPulseV01, type QelPodPulseV01 } from "./pulse.ts";
import { bindRecoveryNodeToPassportV01 } from "./recovery-passport-binding.ts";
import type { SyntheticRecoveryNodeSnapshotV01 } from "./recovery-node-fixture.ts";

export const QEL_FIXTURE_005_REF = "QEL-FIXTURE-005" as const;
export const VSR_QEL_RECOVERY_SETTLEMENT_VERSION =
  "VSR-QEL-RECOVERY-SETTLEMENT-001/0.1" as const;
export const QEL_RECOVERY_SETTLEMENT_ADAPTER_REF =
  "QEL-ADAPTER-RECOVERY-SETTLEMENT-001" as const;
export const QEL_RECOVERY_SETTLEMENT_ADAPTER_VERSION = "0.1.0" as const;
export const QEL_SILK_SETTLEMENT_CAPABILITY_REF = "silk.settlement.submit" as const;

export type RecoverySettlementStateV01 =
  | "DRAFT"
  | "INELIGIBLE"
  | "ELIGIBLE"
  | "APPROVAL_REQUIRED"
  | "AUTHORIZED"
  | "SUBMITTED"
  | "CLAIMED_SETTLED"
  | "VERIFIED_SETTLED"
  | "RECONCILED"
  | "FAILED"
  | "BLOCKED";

export interface SyntheticRecoverySettlementSnapshotV01 {
  settlementRef: string;
  registryRef: string;
  observedAt: string;
  correlationId: string;
  state: RecoverySettlementStateV01;
  recoveryNodeRef: string;
  assetRef: string;
  passportCycleRef: string;
  beneficiaryRef: string;
  currency: string;
  assessedValueMinor: number;
  rewardAmountMinor: number;
  assessmentRef?: string;
  eligibilityPolicyRef: string;
  authorityState: QelAuthorityStateV01;
  authorityRef?: string;
  silkSubmissionRef?: string;
  silkReceiptRef?: string;
  settlementEffectRef?: string;
  reconciliationRef?: string;
  evidenceSourceRefs: readonly string[];
  riverVerification?: QelRiverVerificationReceiptV01;
  synthetic: true;
}

export type RecoverySettlementValidationIssueV01 =
  | "settlement_ref_missing"
  | "registry_ref_missing"
  | "observed_at_invalid"
  | "correlation_id_missing"
  | "recovery_node_ref_missing"
  | "asset_ref_missing"
  | "passport_cycle_ref_missing"
  | "beneficiary_ref_missing"
  | "currency_invalid"
  | "assessed_value_invalid"
  | "reward_amount_invalid"
  | "eligibility_policy_ref_missing"
  | "recovery_passport_binding_blocked"
  | "recovery_assessment_required"
  | "assessment_ref_missing"
  | "positive_reward_required"
  | "authority_allow_required"
  | "authority_ref_missing"
  | "silk_submission_ref_missing"
  | "silk_receipt_ref_missing"
  | "settlement_effect_ref_missing"
  | "river_verification_required"
  | "river_verification_invalid"
  | "reconciliation_ref_missing";

export interface RecoverySettlementValidationResultV01 {
  ok: boolean;
  issues: readonly RecoverySettlementValidationIssueV01[];
}

const VALUE_ELIGIBLE_RECOVERY_STATES: readonly SyntheticRecoveryNodeSnapshotV01["nodeState"][] = [
  "ASSESSED",
  "ROUTING_PENDING",
  "ROUTED",
  "RELEASED",
];

const AUTHORIZED_OR_LATER: readonly RecoverySettlementStateV01[] = [
  "AUTHORIZED",
  "SUBMITTED",
  "CLAIMED_SETTLED",
  "VERIFIED_SETTLED",
  "RECONCILED",
];

const SUBMITTED_OR_LATER: readonly RecoverySettlementStateV01[] = [
  "SUBMITTED",
  "CLAIMED_SETTLED",
  "VERIFIED_SETTLED",
  "RECONCILED",
];

const CLAIMED_OR_LATER: readonly RecoverySettlementStateV01[] = [
  "CLAIMED_SETTLED",
  "VERIFIED_SETTLED",
  "RECONCILED",
];

function isIsoDate(value: string): boolean {
  return Boolean(value) && !Number.isNaN(Date.parse(value));
}

function isMinorUnitAmount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function isCurrencyCode(value: string): boolean {
  return /^[A-Z]{3}$/.test(value);
}

function settlementRiverOutcome(
  snapshot: SyntheticRecoverySettlementSnapshotV01,
): ReturnType<typeof bindRiverVerifiedOutcomeV01> | undefined {
  if (!snapshot.settlementEffectRef) return undefined;
  return bindRiverVerifiedOutcomeV01({
    correlationId: snapshot.correlationId,
    effectRef: snapshot.settlementEffectRef,
    observedAt: snapshot.observedAt,
    maximumReceiptAgeMs: 30_000,
    receipt: snapshot.riverVerification,
  });
}

export function validateSyntheticRecoverySettlementV01(input: {
  settlement: SyntheticRecoverySettlementSnapshotV01;
  recovery: SyntheticRecoveryNodeSnapshotV01;
  passport: SyntheticCircularPassportSnapshotV01;
}): RecoverySettlementValidationResultV01 {
  const { settlement, recovery, passport } = input;
  const issues: RecoverySettlementValidationIssueV01[] = [];
  const binding = bindRecoveryNodeToPassportV01({ recovery, passport });
  const river = settlementRiverOutcome(settlement);

  if (!settlement.settlementRef.trim()) issues.push("settlement_ref_missing");
  if (!settlement.registryRef.trim()) issues.push("registry_ref_missing");
  if (!isIsoDate(settlement.observedAt)) issues.push("observed_at_invalid");
  if (!settlement.correlationId.trim()) issues.push("correlation_id_missing");
  if (!settlement.recoveryNodeRef.trim()) issues.push("recovery_node_ref_missing");
  if (!settlement.assetRef.trim()) issues.push("asset_ref_missing");
  if (!settlement.passportCycleRef.trim()) issues.push("passport_cycle_ref_missing");
  if (!settlement.beneficiaryRef.trim()) issues.push("beneficiary_ref_missing");
  if (!isCurrencyCode(settlement.currency)) issues.push("currency_invalid");
  if (!isMinorUnitAmount(settlement.assessedValueMinor)) issues.push("assessed_value_invalid");
  if (!isMinorUnitAmount(settlement.rewardAmountMinor)) issues.push("reward_amount_invalid");
  if (!settlement.eligibilityPolicyRef.trim()) issues.push("eligibility_policy_ref_missing");

  if (
    binding.state !== "MATCHED" ||
    settlement.recoveryNodeRef !== recovery.nodeRef ||
    settlement.assetRef !== passport.assetRef ||
    settlement.passportCycleRef !== passport.cycleRef
  ) {
    issues.push("recovery_passport_binding_blocked");
  }

  const requiresAssessedRecovery = !["DRAFT", "INELIGIBLE", "BLOCKED", "FAILED"].includes(
    settlement.state,
  );
  if (requiresAssessedRecovery && !VALUE_ELIGIBLE_RECOVERY_STATES.includes(recovery.nodeState)) {
    issues.push("recovery_assessment_required");
  }
  if (requiresAssessedRecovery && !settlement.assessmentRef?.trim()) {
    issues.push("assessment_ref_missing");
  }
  if (requiresAssessedRecovery && settlement.rewardAmountMinor <= 0) {
    issues.push("positive_reward_required");
  }

  if (AUTHORIZED_OR_LATER.includes(settlement.state)) {
    if (settlement.authorityState !== "ALLOWED") issues.push("authority_allow_required");
    if (!settlement.authorityRef?.trim()) issues.push("authority_ref_missing");
  }

  if (SUBMITTED_OR_LATER.includes(settlement.state) && !settlement.silkSubmissionRef?.trim()) {
    issues.push("silk_submission_ref_missing");
  }

  if (CLAIMED_OR_LATER.includes(settlement.state)) {
    if (!settlement.silkReceiptRef?.trim()) issues.push("silk_receipt_ref_missing");
    if (!settlement.settlementEffectRef?.trim()) issues.push("settlement_effect_ref_missing");
  }

  if (settlement.state === "VERIFIED_SETTLED" || settlement.state === "RECONCILED") {
    if (!settlement.riverVerification) {
      issues.push("river_verification_required");
    } else if (river?.outcome.state !== "VERIFIED") {
      issues.push("river_verification_invalid");
    }
  }

  if (settlement.state === "RECONCILED" && !settlement.reconciliationRef?.trim()) {
    issues.push("reconciliation_ref_missing");
  }

  return { ok: issues.length === 0, issues };
}

function mapState(
  settlement: SyntheticRecoverySettlementSnapshotV01,
  validation: RecoverySettlementValidationResultV01,
): QelOperationalFrameV01["state"] {
  if (!validation.ok || settlement.state === "BLOCKED" || settlement.state === "FAILED") {
    return { value: "BLOCKED", kind: "FACT", confidence: 1 };
  }
  if (settlement.state === "INELIGIBLE") {
    return { value: "STOPPED", kind: "FACT", confidence: 1 };
  }
  if (settlement.state === "APPROVAL_REQUIRED") {
    return { value: "WAITING", kind: "FACT", confidence: 1 };
  }
  if (settlement.state === "RECONCILED") {
    return { value: "RETIRED", kind: "FACT", confidence: 1 };
  }
  if (["SUBMITTED", "CLAIMED_SETTLED", "VERIFIED_SETTLED"].includes(settlement.state)) {
    return { value: "ACTIVE", kind: "FACT", confidence: 1 };
  }
  return { value: "READY", kind: "FACT", confidence: 1 };
}

function mapHealth(
  settlement: SyntheticRecoverySettlementSnapshotV01,
  validation: RecoverySettlementValidationResultV01,
): QelOperationalFrameV01["health"] {
  if (!validation.ok || settlement.state === "BLOCKED" || settlement.state === "FAILED") {
    return { value: "ACT", kind: "DERIVED", confidence: 1 };
  }
  if (settlement.state === "CLAIMED_SETTLED") {
    return { value: "WATCH", kind: "DERIVED", confidence: 1 };
  }
  return { value: "GOOD", kind: "DERIVED", confidence: 1 };
}

function mapFlow(settlement: SyntheticRecoverySettlementSnapshotV01): QelOperationalFrameV01["flow"] {
  let state: QelOperationalFrameV01["flow"]["state"] = "NONE";
  if (settlement.state === "DRAFT" || settlement.state === "ELIGIBLE") state = "STARTING";
  else if (settlement.state === "APPROVAL_REQUIRED") state = "QUEUED";
  else if (["AUTHORIZED", "SUBMITTED", "CLAIMED_SETTLED"].includes(settlement.state)) state = "FLOWING";
  else if (["VERIFIED_SETTLED", "RECONCILED", "INELIGIBLE"].includes(settlement.state)) state = "COMPLETE";
  else if (settlement.state === "FAILED" || settlement.state === "BLOCKED") state = "BLOCKED";

  return {
    state,
    value: settlement.rewardAmountMinor,
    unit: `${settlement.currency}_MINOR`,
    direction: "OUTPUT",
    trend: "UNKNOWN",
  };
}

function mapDemand(settlement: SyntheticRecoverySettlementSnapshotV01): QelOperationalFrameV01["demand"] {
  switch (settlement.state) {
    case "DRAFT":
      return { type: "INFORMATION", priority: "MODERATE", target: "complete_recovery_value_assessment" };
    case "ELIGIBLE":
    case "APPROVAL_REQUIRED":
      return { type: "APPROVAL", priority: "HIGH", target: "authorize_recovery_reward" };
    case "AUTHORIZED":
      return { type: "SETTLEMENT", priority: "HIGH", target: "submit_silk_settlement" };
    case "SUBMITTED":
    case "CLAIMED_SETTLED":
    case "VERIFIED_SETTLED":
      return { type: "SETTLEMENT", priority: "MODERATE", target: "reconcile_recovery_settlement" };
    case "FAILED":
    case "BLOCKED":
      return { type: "INFORMATION", priority: "HIGH", target: "resolve_recovery_settlement_exception" };
    default:
      return { type: "NONE", priority: "NONE" };
  }
}

function mapRisk(
  settlement: SyntheticRecoverySettlementSnapshotV01,
  validation: RecoverySettlementValidationResultV01,
): QelOperationalFrameV01["risk"] {
  if (!validation.ok) return { type: "RECOVERY_SETTLEMENT_INVALID", severity: "HIGH", confidence: 1 };
  if (settlement.state === "FAILED" || settlement.state === "BLOCKED") {
    return { type: "RECOVERY_SETTLEMENT_FAILURE", severity: "HIGH", confidence: 1 };
  }
  if (settlement.state === "CLAIMED_SETTLED") {
    return { type: "UNVERIFIED_SETTLEMENT_CLAIM", severity: "MODERATE", confidence: 1 };
  }
  return { type: "NONE", severity: "NONE", confidence: 1 };
}

function mapOutcome(settlement: SyntheticRecoverySettlementSnapshotV01): QelOperationalFrameV01["outcome"] {
  if (settlement.state === "FAILED" || settlement.state === "BLOCKED") return { state: "FAILED" };
  if (!settlement.settlementEffectRef) return { state: "OBSERVED" };

  const river = settlementRiverOutcome(settlement);
  if (river) return river.outcome;
  return { state: "EVIDENCE_BOUND", effectRef: settlement.settlementEffectRef };
}

export function mapSyntheticRecoverySettlementToQelFrameV01(input: {
  settlement: SyntheticRecoverySettlementSnapshotV01;
  recovery: SyntheticRecoveryNodeSnapshotV01;
  passport: SyntheticCircularPassportSnapshotV01;
}): QelOperationalFrameV01 {
  const validation = validateSyntheticRecoverySettlementV01(input);
  const hasEvidence = input.settlement.evidenceSourceRefs.length > 0;
  const settlement = input.settlement;

  return {
    contractVersion: VSR_QEL_CORE_CONTRACT_VERSION,
    frameRef: `${QEL_FIXTURE_005_REF}:${settlement.settlementRef}:${settlement.correlationId}`,
    correlationId: settlement.correlationId,
    observedAt: settlement.observedAt,
    object: {
      id: settlement.settlementRef,
      type: "RECOVERY_SETTLEMENT",
      class: "SILK_RECOVERY_REWARD",
      registryRef: settlement.registryRef,
      locationRef: input.recovery.locationRef,
    },
    state: mapState(settlement, validation),
    health: mapHealth(settlement, validation),
    flow: mapFlow(settlement),
    demand: mapDemand(settlement),
    risk: mapRisk(settlement, validation),
    moves: [
      { action: "VIEW", authority: "ALLOWED", targetRef: settlement.settlementRef },
      {
        action: "ASSESS_VALUE",
        authority: "APPROVAL_REQUIRED",
        capabilityRef: "recovery.value.assess",
        targetRef: settlement.assetRef,
      },
      {
        action: "AUTHORIZE_SETTLEMENT",
        authority: "APPROVAL_REQUIRED",
        capabilityRef: "warden.settlement.authorize",
        targetRef: settlement.settlementRef,
      },
      {
        action: "SUBMIT_SETTLEMENT",
        authority: "APPROVAL_REQUIRED",
        capabilityRef: QEL_SILK_SETTLEMENT_CAPABILITY_REF,
        targetRef: settlement.beneficiaryRef,
      },
      {
        action: "RECONCILE_SETTLEMENT",
        authority: "APPROVAL_REQUIRED",
        capabilityRef: "silk.settlement.reconcile",
        targetRef: settlement.settlementRef,
      },
    ],
    evidence: {
      status: hasEvidence ? "FRESH" : "MISSING",
      confidence: hasEvidence ? 1 : 0,
      freshness: {
        observedAt: settlement.observedAt,
        ageMs: 0,
        status: hasEvidence ? "FRESH" : "MISSING",
        maximumValidAgeMs: 30_000,
      },
      sources: settlement.evidenceSourceRefs.map((sourceRef) => ({
        sourceRef,
        kind: "SYSTEM" as const,
        nativeRef: sourceRef,
      })),
      riverReceiptRef: settlement.riverVerification?.receiptRef,
    },
    outcome: mapOutcome(settlement),
    native: {
      provider: "SYNNERGYZE_SILK_SETTLEMENT_SIMULATOR",
      protocol: "SYNTHETIC_FIXTURE",
      sourceRef: settlement.settlementRef,
      rawValue: {
        contractVersion: VSR_QEL_RECOVERY_SETTLEMENT_VERSION,
        state: settlement.state,
        recoveryNodeRef: settlement.recoveryNodeRef,
        assetRef: settlement.assetRef,
        passportCycleRef: settlement.passportCycleRef,
        beneficiaryRef: settlement.beneficiaryRef,
        currency: settlement.currency,
        assessedValueMinor: settlement.assessedValueMinor,
        rewardAmountMinor: settlement.rewardAmountMinor,
        assessmentRef: settlement.assessmentRef,
        eligibilityPolicyRef: settlement.eligibilityPolicyRef,
        authorityState: settlement.authorityState,
        authorityRef: settlement.authorityRef,
        silkSubmissionRef: settlement.silkSubmissionRef,
        silkReceiptRef: settlement.silkReceiptRef,
        settlementEffectRef: settlement.settlementEffectRef,
        reconciliationRef: settlement.reconciliationRef,
        validationIssues: validation.issues,
        synthetic: true,
      },
      adapterRef: QEL_RECOVERY_SETTLEMENT_ADAPTER_REF,
      adapterVersion: QEL_RECOVERY_SETTLEMENT_ADAPTER_VERSION,
    },
  };
}

export function buildSyntheticRecoverySettlementPodPulseV01(input: {
  settlement: SyntheticRecoverySettlementSnapshotV01;
  recovery: SyntheticRecoveryNodeSnapshotV01;
  passport: SyntheticCircularPassportSnapshotV01;
  podRef: string;
}): QelPodPulseV01 {
  return buildQelPodPulseV01({
    podRef: input.podRef,
    observedAt: input.settlement.observedAt,
    frames: [mapSyntheticRecoverySettlementToQelFrameV01(input)],
  });
}

export function makeSyntheticRecoverySettlementSnapshotV01(
  overrides: Partial<SyntheticRecoverySettlementSnapshotV01> = {},
): SyntheticRecoverySettlementSnapshotV01 {
  return {
    settlementRef: "SILK-RECOVERY-SETTLEMENT-001",
    registryRef: "GENESIS:SILK-RECOVERY-SETTLEMENT-001",
    observedAt: "2026-08-23T07:00:00.000Z",
    correlationId: "QEL-FIXTURE-005-CORR-001",
    state: "DRAFT",
    recoveryNodeRef: "RECOVERY-NODE-BLR-001",
    assetRef: "GARMENT-98F1",
    passportCycleRef: "GARMENT-98F1:CYCLE-01",
    beneficiaryRef: "DIGITALME:RECOVERY-PARTICIPANT-001",
    currency: "INR",
    assessedValueMinor: 0,
    rewardAmountMinor: 0,
    eligibilityPolicyRef: "RECOVERY-REWARD-POLICY-001",
    authorityState: "UNRESOLVED",
    evidenceSourceRefs: ["SIM-RECOVERY-ASSESSMENT-001"],
    synthetic: true,
    ...overrides,
  };
}
