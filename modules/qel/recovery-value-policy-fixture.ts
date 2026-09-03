import type { SyntheticCircularPassportSnapshotV01 } from "./circular-passport-fixture.ts";
import { VSR_QEL_CORE_CONTRACT_VERSION, type QelOperationalFrameV01 } from "./operational-contracts.ts";
import { buildQelPodPulseV01, type QelPodPulseV01 } from "./pulse.ts";
import { bindRecoveryNodeToPassportV01 } from "./recovery-passport-binding.ts";
import type { RecoveryRouteV01, SyntheticRecoveryNodeSnapshotV01 } from "./recovery-node-fixture.ts";
import {
  makeSyntheticRecoverySettlementSnapshotV01,
  type SyntheticRecoverySettlementSnapshotV01,
} from "./recovery-settlement-fixture.ts";

export const QEL_FIXTURE_006_REF = "QEL-FIXTURE-006" as const;
export const VSR_QEL_RECOVERY_VALUE_POLICY_VERSION = "VSR-QEL-RECOVERY-VALUE-POLICY-001/0.1" as const;
export const QEL_RECOVERY_VALUE_ADAPTER_REF = "QEL-ADAPTER-RECOVERY-VALUE-001" as const;
export const QEL_RECOVERY_VALUE_ADAPTER_VERSION = "0.1.0" as const;

export type RecoveryConditionGradeV01 = "A" | "B" | "C" | "D" | "SCRAP";

export interface RecoveryValuePriceBookV01 {
  contractVersion: typeof VSR_QEL_RECOVERY_VALUE_POLICY_VERSION;
  priceBookRef: string;
  policyVersion: string;
  currency: string;
  validFrom: string;
  validUntil?: string;
  rewardShareBps: number;
  minimumRewardMinor: number;
  maximumRewardMinor: number;
  conditionFactorBps: Readonly<Record<RecoveryConditionGradeV01, number>>;
  routeFactorBps: Readonly<Record<RecoveryRouteV01, number>>;
}

export interface SyntheticRecoveryValueAssessmentV01 {
  valuationRef: string;
  registryRef: string;
  observedAt: string;
  correlationId: string;
  recoveryNodeRef: string;
  assetRef: string;
  passportCycleRef: string;
  beneficiaryRef: string;
  conditionGrade: RecoveryConditionGradeV01;
  route: RecoveryRouteV01;
  assessmentRef: string;
  assessedResidualValueMinor: number;
  materialRecoveryValueMinor: number;
  programmeIncentiveMinor: number;
  environmentalIncentiveMinor: number;
  environmentalEvidenceRef?: string;
  handlingDeductionMinor: number;
  evidenceSourceRefs: readonly string[];
  synthetic: true;
}

export interface RecoveryValueBreakdownV01 {
  currency: string;
  assessedResidualValueMinor: number;
  conditionAdjustedResidualMinor: number;
  routeAdjustedResidualMinor: number;
  residualRewardMinor: number;
  materialRecoveryValueMinor: number;
  programmeIncentiveMinor: number;
  environmentalIncentiveMinor: number;
  handlingDeductionMinor: number;
  grossRewardMinor: number;
  preClampNetRewardMinor: number;
  rewardAmountMinor: number;
}

export type RecoveryValuePolicyIssueV01 =
  | "price_book_ref_missing"
  | "policy_version_missing"
  | "currency_invalid"
  | "policy_window_invalid"
  | "policy_not_effective"
  | "reward_share_invalid"
  | "reward_bounds_invalid"
  | "condition_factor_invalid"
  | "route_factor_invalid"
  | "valuation_ref_missing"
  | "registry_ref_missing"
  | "observed_at_invalid"
  | "correlation_id_missing"
  | "beneficiary_ref_missing"
  | "assessment_ref_missing"
  | "amount_invalid"
  | "environmental_evidence_required"
  | "recovery_passport_binding_blocked"
  | "recovery_not_assessed"
  | "route_mismatch";

export interface RecoveryValuePolicyResultV01 {
  ok: boolean;
  eligible: boolean;
  issues: readonly RecoveryValuePolicyIssueV01[];
  priceBookRef: string;
  policyVersion: string;
  breakdown?: RecoveryValueBreakdownV01;
}

const VALUE_READY_RECOVERY_STATES: readonly SyntheticRecoveryNodeSnapshotV01["nodeState"][] = [
  "ASSESSED",
  "ROUTING_PENDING",
  "ROUTED",
  "RELEASED",
];

function isIsoDate(value: string): boolean {
  return Boolean(value) && !Number.isNaN(Date.parse(value));
}

function isCurrencyCode(value: string): boolean {
  return /^[A-Z]{3}$/.test(value);
}

function isMinorAmount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function isBps(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= 30_000;
}

function mulBps(value: number, bps: number): number {
  return Math.floor((value * bps) / 10_000);
}

function policyEffectiveAt(policy: RecoveryValuePriceBookV01, observedAt: string): boolean {
  const observed = Date.parse(observedAt);
  const from = Date.parse(policy.validFrom);
  const until = policy.validUntil ? Date.parse(policy.validUntil) : undefined;
  if (!Number.isFinite(observed) || !Number.isFinite(from)) return false;
  if (until !== undefined && !Number.isFinite(until)) return false;
  if (observed < from) return false;
  if (until !== undefined && observed > until) return false;
  return true;
}

export function evaluateRecoveryValuePolicyV01(input: {
  priceBook: RecoveryValuePriceBookV01;
  assessment: SyntheticRecoveryValueAssessmentV01;
  recovery: SyntheticRecoveryNodeSnapshotV01;
  passport: SyntheticCircularPassportSnapshotV01;
}): RecoveryValuePolicyResultV01 {
  const { priceBook, assessment, recovery, passport } = input;
  const issues: RecoveryValuePolicyIssueV01[] = [];
  const binding = bindRecoveryNodeToPassportV01({ recovery, passport });

  if (!priceBook.priceBookRef.trim()) issues.push("price_book_ref_missing");
  if (!priceBook.policyVersion.trim()) issues.push("policy_version_missing");
  if (!isCurrencyCode(priceBook.currency)) issues.push("currency_invalid");
  if (!isIsoDate(priceBook.validFrom) || (priceBook.validUntil && !isIsoDate(priceBook.validUntil))) {
    issues.push("policy_window_invalid");
  }
  if (!policyEffectiveAt(priceBook, assessment.observedAt)) issues.push("policy_not_effective");
  if (!isBps(priceBook.rewardShareBps)) issues.push("reward_share_invalid");
  if (
    !isMinorAmount(priceBook.minimumRewardMinor) ||
    !isMinorAmount(priceBook.maximumRewardMinor) ||
    priceBook.maximumRewardMinor < priceBook.minimumRewardMinor
  ) {
    issues.push("reward_bounds_invalid");
  }
  if (Object.values(priceBook.conditionFactorBps).some((value) => !isBps(value))) {
    issues.push("condition_factor_invalid");
  }
  if (Object.values(priceBook.routeFactorBps).some((value) => !isBps(value))) {
    issues.push("route_factor_invalid");
  }

  if (!assessment.valuationRef.trim()) issues.push("valuation_ref_missing");
  if (!assessment.registryRef.trim()) issues.push("registry_ref_missing");
  if (!isIsoDate(assessment.observedAt)) issues.push("observed_at_invalid");
  if (!assessment.correlationId.trim()) issues.push("correlation_id_missing");
  if (!assessment.beneficiaryRef.trim()) issues.push("beneficiary_ref_missing");
  if (!assessment.assessmentRef.trim()) issues.push("assessment_ref_missing");
  if (
    !isMinorAmount(assessment.assessedResidualValueMinor) ||
    !isMinorAmount(assessment.materialRecoveryValueMinor) ||
    !isMinorAmount(assessment.programmeIncentiveMinor) ||
    !isMinorAmount(assessment.environmentalIncentiveMinor) ||
    !isMinorAmount(assessment.handlingDeductionMinor)
  ) {
    issues.push("amount_invalid");
  }
  if (assessment.environmentalIncentiveMinor > 0 && !assessment.environmentalEvidenceRef?.trim()) {
    issues.push("environmental_evidence_required");
  }

  if (
    binding.state !== "MATCHED" ||
    assessment.recoveryNodeRef !== recovery.nodeRef ||
    assessment.assetRef !== passport.assetRef ||
    assessment.passportCycleRef !== passport.cycleRef
  ) {
    issues.push("recovery_passport_binding_blocked");
  }
  if (!VALUE_READY_RECOVERY_STATES.includes(recovery.nodeState)) {
    issues.push("recovery_not_assessed");
  }
  if (recovery.route && assessment.route !== recovery.route) {
    issues.push("route_mismatch");
  }

  if (issues.length > 0) {
    return {
      ok: false,
      eligible: false,
      issues,
      priceBookRef: priceBook.priceBookRef,
      policyVersion: priceBook.policyVersion,
    };
  }

  const conditionAdjustedResidualMinor = mulBps(
    assessment.assessedResidualValueMinor,
    priceBook.conditionFactorBps[assessment.conditionGrade],
  );
  const routeAdjustedResidualMinor = mulBps(
    conditionAdjustedResidualMinor,
    priceBook.routeFactorBps[assessment.route],
  );
  const residualRewardMinor = mulBps(routeAdjustedResidualMinor, priceBook.rewardShareBps);
  const grossRewardMinor =
    residualRewardMinor +
    assessment.materialRecoveryValueMinor +
    assessment.programmeIncentiveMinor +
    assessment.environmentalIncentiveMinor;
  const preClampNetRewardMinor = Math.max(0, grossRewardMinor - assessment.handlingDeductionMinor);
  const rewardAmountMinor =
    preClampNetRewardMinor === 0
      ? 0
      : Math.min(
          priceBook.maximumRewardMinor,
          Math.max(priceBook.minimumRewardMinor, preClampNetRewardMinor),
        );

  const breakdown: RecoveryValueBreakdownV01 = {
    currency: priceBook.currency,
    assessedResidualValueMinor: assessment.assessedResidualValueMinor,
    conditionAdjustedResidualMinor,
    routeAdjustedResidualMinor,
    residualRewardMinor,
    materialRecoveryValueMinor: assessment.materialRecoveryValueMinor,
    programmeIncentiveMinor: assessment.programmeIncentiveMinor,
    environmentalIncentiveMinor: assessment.environmentalIncentiveMinor,
    handlingDeductionMinor: assessment.handlingDeductionMinor,
    grossRewardMinor,
    preClampNetRewardMinor,
    rewardAmountMinor,
  };

  return {
    ok: true,
    eligible: rewardAmountMinor > 0,
    issues: [],
    priceBookRef: priceBook.priceBookRef,
    policyVersion: priceBook.policyVersion,
    breakdown,
  };
}

export function mapRecoveryValuePolicyToQelFrameV01(input: {
  priceBook: RecoveryValuePriceBookV01;
  assessment: SyntheticRecoveryValueAssessmentV01;
  recovery: SyntheticRecoveryNodeSnapshotV01;
  passport: SyntheticCircularPassportSnapshotV01;
}): QelOperationalFrameV01 {
  const result = evaluateRecoveryValuePolicyV01(input);
  const hasEvidence = input.assessment.evidenceSourceRefs.length > 0;
  const rewardAmountMinor = result.breakdown?.rewardAmountMinor ?? 0;

  return {
    contractVersion: VSR_QEL_CORE_CONTRACT_VERSION,
    frameRef: `${QEL_FIXTURE_006_REF}:${input.assessment.valuationRef}:${input.assessment.correlationId}`,
    correlationId: input.assessment.correlationId,
    observedAt: input.assessment.observedAt,
    object: {
      id: input.assessment.valuationRef,
      type: "RECOVERY_VALUE_QUOTE",
      class: "POLICY_PRICED_RECOVERY_VALUE",
      registryRef: input.assessment.registryRef,
      locationRef: input.recovery.locationRef,
    },
    state: {
      value: !result.ok ? "BLOCKED" : result.eligible ? "READY" : "STOPPED",
      kind: "DERIVED",
      confidence: 1,
    },
    health: {
      value: result.ok ? "GOOD" : "ACT",
      kind: "DERIVED",
      confidence: 1,
    },
    flow: {
      state: result.ok ? "COMPLETE" : "BLOCKED",
      value: rewardAmountMinor,
      unit: `${input.priceBook.currency}_MINOR`,
      direction: "OUTPUT",
      trend: "UNKNOWN",
    },
    demand: !result.ok
      ? { type: "INFORMATION", priority: "HIGH", target: "resolve_recovery_value_policy" }
      : result.eligible
        ? { type: "APPROVAL", priority: "HIGH", target: "create_recovery_settlement_obligation" }
        : { type: "NONE", priority: "NONE" },
    risk: !result.ok
      ? { type: "RECOVERY_VALUE_POLICY_INVALID", severity: "HIGH", confidence: 1 }
      : { type: "NONE", severity: "NONE", confidence: 1 },
    moves: [
      { action: "VIEW", authority: "ALLOWED", targetRef: input.assessment.valuationRef },
      {
        action: "REPRICE",
        authority: "APPROVAL_REQUIRED",
        capabilityRef: "recovery.value.reprice",
        targetRef: input.assessment.assetRef,
      },
      {
        action: "CREATE_SETTLEMENT_OBLIGATION",
        authority: "APPROVAL_REQUIRED",
        capabilityRef: "recovery.settlement.create",
        targetRef: input.assessment.beneficiaryRef,
      },
    ],
    evidence: {
      status: hasEvidence ? "FRESH" : "MISSING",
      confidence: hasEvidence ? 1 : 0,
      freshness: {
        observedAt: input.assessment.observedAt,
        ageMs: 0,
        status: hasEvidence ? "FRESH" : "MISSING",
        maximumValidAgeMs: 30_000,
      },
      sources: input.assessment.evidenceSourceRefs.map((sourceRef) => ({
        sourceRef,
        kind: "SYSTEM" as const,
        nativeRef: sourceRef,
      })),
    },
    outcome: result.ok ? { state: "OBSERVED" } : { state: "FAILED" },
    native: {
      provider: "SYNNERGYZE_RECOVERY_VALUE_POLICY",
      protocol: "DETERMINISTIC_POLICY_FIXTURE",
      sourceRef: input.assessment.valuationRef,
      rawValue: {
        contractVersion: VSR_QEL_RECOVERY_VALUE_POLICY_VERSION,
        priceBookRef: input.priceBook.priceBookRef,
        policyVersion: input.priceBook.policyVersion,
        conditionGrade: input.assessment.conditionGrade,
        route: input.assessment.route,
        assessmentRef: input.assessment.assessmentRef,
        breakdown: result.breakdown,
        issues: result.issues,
        environmentalEvidenceRef: input.assessment.environmentalEvidenceRef,
        synthetic: true,
      },
      adapterRef: QEL_RECOVERY_VALUE_ADAPTER_REF,
      adapterVersion: QEL_RECOVERY_VALUE_ADAPTER_VERSION,
    },
  };
}

export function makeSettlementFromRecoveryValuePolicyV01(input: {
  priceBook: RecoveryValuePriceBookV01;
  assessment: SyntheticRecoveryValueAssessmentV01;
  recovery: SyntheticRecoveryNodeSnapshotV01;
  passport: SyntheticCircularPassportSnapshotV01;
  settlementRef?: string;
}): SyntheticRecoverySettlementSnapshotV01 {
  const result = evaluateRecoveryValuePolicyV01(input);
  const rewardAmountMinor = result.breakdown?.rewardAmountMinor ?? 0;

  return makeSyntheticRecoverySettlementSnapshotV01({
    settlementRef: input.settlementRef ?? `SETTLEMENT:${input.assessment.valuationRef}`,
    registryRef: `GENESIS:SETTLEMENT:${input.assessment.valuationRef}`,
    observedAt: input.assessment.observedAt,
    correlationId: input.assessment.correlationId,
    state: result.ok && result.eligible ? "APPROVAL_REQUIRED" : "INELIGIBLE",
    recoveryNodeRef: input.recovery.nodeRef,
    assetRef: input.passport.assetRef,
    passportCycleRef: input.passport.cycleRef,
    beneficiaryRef: input.assessment.beneficiaryRef,
    currency: input.priceBook.currency,
    assessedValueMinor: input.assessment.assessedResidualValueMinor,
    rewardAmountMinor,
    assessmentRef: input.assessment.assessmentRef,
    eligibilityPolicyRef: `${input.priceBook.priceBookRef}@${input.priceBook.policyVersion}`,
    authorityState: "UNRESOLVED",
    evidenceSourceRefs: input.assessment.evidenceSourceRefs,
  });
}

export function buildRecoveryValuePodPulseV01(input: {
  priceBook: RecoveryValuePriceBookV01;
  assessment: SyntheticRecoveryValueAssessmentV01;
  recovery: SyntheticRecoveryNodeSnapshotV01;
  passport: SyntheticCircularPassportSnapshotV01;
  podRef: string;
}): QelPodPulseV01 {
  return buildQelPodPulseV01({
    podRef: input.podRef,
    observedAt: input.assessment.observedAt,
    frames: [mapRecoveryValuePolicyToQelFrameV01(input)],
  });
}

export function makeSyntheticRecoveryValuePriceBookV01(
  overrides: Partial<RecoveryValuePriceBookV01> = {},
): RecoveryValuePriceBookV01 {
  return {
    contractVersion: VSR_QEL_RECOVERY_VALUE_POLICY_VERSION,
    priceBookRef: "RECOVERY-PRICE-BOOK-INDIA-001",
    policyVersion: "1.0.0",
    currency: "INR",
    validFrom: "2026-08-01T00:00:00.000Z",
    rewardShareBps: 5_000,
    minimumRewardMinor: 100,
    maximumRewardMinor: 20_000,
    conditionFactorBps: {
      A: 10_000,
      B: 8_000,
      C: 6_000,
      D: 3_500,
      SCRAP: 1_000,
    },
    routeFactorBps: {
      REUSE: 10_000,
      REPAIR: 7_000,
      REFURBISH: 8_000,
      REMANUFACTURE: 6_000,
      RECYCLE: 3_000,
      RETURN_TO_OWNER: 5_000,
      QUARANTINE: 0,
    },
    ...overrides,
  };
}

export function makeSyntheticRecoveryValueAssessmentV01(
  overrides: Partial<SyntheticRecoveryValueAssessmentV01> = {},
): SyntheticRecoveryValueAssessmentV01 {
  return {
    valuationRef: "RECOVERY-VALUE:GARMENT-98F1:CYCLE-01",
    registryRef: "GENESIS:RECOVERY-VALUE:GARMENT-98F1:CYCLE-01",
    observedAt: "2026-08-23T07:30:00.000Z",
    correlationId: "QEL-FIXTURE-006-CORR-001",
    recoveryNodeRef: "RECOVERY-NODE-BLR-001",
    assetRef: "GARMENT-98F1",
    passportCycleRef: "GARMENT-98F1:CYCLE-01",
    beneficiaryRef: "DIGITALME:RECOVERY-PARTICIPANT-001",
    conditionGrade: "B",
    route: "REPAIR",
    assessmentRef: "ASSESSMENT:GARMENT-98F1:CYCLE-01",
    assessedResidualValueMinor: 10_000,
    materialRecoveryValueMinor: 500,
    programmeIncentiveMinor: 200,
    environmentalIncentiveMinor: 100,
    environmentalEvidenceRef: "RIVER:ENVIRONMENTAL-IMPACT-001",
    handlingDeductionMinor: 300,
    evidenceSourceRefs: ["SIM-ASSESSMENT-001", "SIM-MATERIAL-VALUE-001"],
    synthetic: true,
    ...overrides,
  };
}
