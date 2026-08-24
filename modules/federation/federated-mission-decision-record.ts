import { createHash } from "node:crypto";

import type { WardenDecisionV1 } from "../warden/contracts.ts";
import type {
  DestinationFederationAuthorityBindingV1,
  LicenceFederationObjectV1,
} from "./federated-mission.ts";
import {
  buildFederationAuthorizationBindingV1,
  computeTrustPathProofDigestV1,
  type FederationContractResolutionV1,
  type FederatedLicenceEvidenceSuccessV1,
  type TrustPathProofV1,
} from "./federated-mission-evidence.ts";

export interface FederationDecisionRecordV1 {
  recordRef: string;
  federationId: string;
  missionRef: string;
  sourceDomainRef: string;
  destinationDomainRef: string;
  principalRef: string;
  productRef: string;
  contractRef: string;
  purpose: string;
  sourceDecisionRef: string;
  destinationDecisionRef: string;
  trustPathProofRef: string;
  trustPathDigest: string;
  trustGraphVersion: string;
  trustResolverRef: string;
  contractResolutionRef: string;
  contractResolutionDigest: string;
  destinationAuthorityBindingRef: string;
  destinationAuthorityDigest: string;
  authorizationRequestRef: string;
  riverReservationRef: string;
  executionReceiptRef: string;
  observationRef: string;
  verifiedEffectRef: string;
  correlationId: string;
  recordedAt: string;
  decisionTraceDigest: string;
  synthetic: true;
  persisted: false;
}

export type FederationDecisionRecordBuildReasonCodeV1 =
  | "DECISION_RECORD_TRUST_PROVENANCE_REQUIRED"
  | "DECISION_RECORD_TRUST_PROVENANCE_INVALID"
  | "DECISION_RECORD_LINEAGE_MISMATCH"
  | "DECISION_RECORD_TIME_INVALID";

export interface FederationDecisionRecordBuildSuccessV1 {
  ok: true;
  record: FederationDecisionRecordV1;
}

export interface FederationDecisionRecordBuildFailureV1 {
  ok: false;
  reasonCode: FederationDecisionRecordBuildReasonCodeV1;
}

export type FederationDecisionRecordBuildResultV1 =
  | FederationDecisionRecordBuildSuccessV1
  | FederationDecisionRecordBuildFailureV1;

export type FederationDecisionRecordAppendReasonCodeV1 =
  | "DECISION_RECORD_INTEGRITY_MISMATCH"
  | "DECISION_RECORD_APPEND_CONFLICT";

export interface FederationDecisionRecordAppendSuccessV1 {
  state: "APPENDED";
  record: FederationDecisionRecordV1;
  idempotentReplay: boolean;
}

export interface FederationDecisionRecordAppendFailureV1 {
  state: "REJECTED";
  federationId: string;
  reasonCode: FederationDecisionRecordAppendReasonCodeV1;
}

export type FederationDecisionRecordAppendResultV1 =
  | FederationDecisionRecordAppendSuccessV1
  | FederationDecisionRecordAppendFailureV1;

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function digestRef(value: unknown): string {
  return `sha256:${digest(JSON.stringify(value))}`;
}

function parseInstant(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stripDigestNamespace(value: string, prefix: string): string | null {
  if (!value.startsWith(prefix)) return null;
  const digestValue = value.slice(prefix.length);
  return /^sha256:[0-9a-f]{64}$/.test(digestValue) ? digestValue : null;
}

function completeTrustProvenance(
  trustPathProof: TrustPathProofV1,
): trustPathProof is TrustPathProofV1 & {
  graphVersion: string;
  resolverRef: string;
  authoritativeSourceRefs: readonly string[];
  evidenceRefs: readonly string[];
  resolutionDigest: string;
} {
  return Boolean(
    trustPathProof.graphVersion?.trim() &&
      trustPathProof.resolverRef?.trim() &&
      trustPathProof.authoritativeSourceRefs?.length &&
      trustPathProof.evidenceRefs?.length &&
      trustPathProof.resolutionDigest,
  );
}

function provenanceDigestIsValid(trustPathProof: TrustPathProofV1): boolean {
  if (!completeTrustProvenance(trustPathProof)) return false;
  const { resolutionDigest: _claimedDigest, ...digestInput } = trustPathProof;
  return trustPathProof.resolutionDigest === computeTrustPathProofDigestV1(digestInput);
}

function lineageMatches(input: {
  federationObject: LicenceFederationObjectV1;
  trustPathProof: TrustPathProofV1;
  contractResolution: FederationContractResolutionV1;
  destinationAuthorityBinding: DestinationFederationAuthorityBindingV1;
  destinationDecision: WardenDecisionV1;
  governed: FederatedLicenceEvidenceSuccessV1;
}): boolean {
  const {
    federationObject,
    trustPathProof,
    contractResolution,
    destinationAuthorityBinding,
    destinationDecision,
    governed,
  } = input;

  const authorization = buildFederationAuthorizationBindingV1({
    federationObject,
    trustPathProof,
    contractResolution,
    destinationAuthorityBinding,
  });

  return Boolean(
    governed.state === "VERIFIED_LOCAL_EFFECT" &&
      governed.federationId === federationObject.federationId &&
      governed.trustPathProofRef === trustPathProof.proofRef &&
      governed.contractResolutionRef === contractResolution.resolutionRef &&
      governed.destinationAuthorityBindingRef === destinationAuthorityBinding.bindingRef &&
      governed.authorizationRequestRef === authorization.requestRef &&
      destinationDecision.requestRef === authorization.requestRef &&
      destinationDecision.decisionRef === governed.reservation.wardenDecisionRef &&
      destinationDecision.decisionRef === governed.execution.wardenDecisionRef &&
      destinationDecision.decisionRef === governed.verification.effect.wardenDecisionRef &&
      governed.reservation.reservationRef === governed.execution.reservationRef &&
      governed.reservation.reservationRef === governed.verification.effect.reservationRef &&
      governed.execution.receiptRef === governed.observation.executionReceiptRef &&
      governed.execution.receiptRef === governed.verification.effect.executionReceiptRef &&
      governed.execution.actionRef === governed.reservation.actionRef &&
      governed.execution.programRef === federationObject.missionRef &&
      governed.execution.eventRef === federationObject.federationId &&
      governed.execution.targetRef === federationObject.productRef &&
      governed.observation.programRef === federationObject.missionRef &&
      governed.observation.eventRef === federationObject.federationId &&
      governed.observation.targetRef === federationObject.productRef &&
      governed.verification.effect.programRef === federationObject.missionRef &&
      governed.verification.effect.eventRef === federationObject.federationId &&
      governed.verification.effect.targetRef === federationObject.productRef &&
      governed.execution.correlationId === destinationDecision.correlationId &&
      governed.observation.correlationId === destinationDecision.correlationId &&
      governed.verification.effect.correlationId === destinationDecision.correlationId &&
      contractResolution.contractRef === federationObject.contractRef &&
      contractResolution.sourceDomainRef === federationObject.sourceDomainRef &&
      contractResolution.destinationDomainRef === federationObject.destinationDomainRef &&
      contractResolution.purpose === federationObject.purpose &&
      destinationAuthorityBinding.wardenRef === destinationDecision.wardenRef &&
      destinationAuthorityBinding.domainRef === federationObject.destinationDomainRef &&
      destinationAuthorityBinding.contractRef === federationObject.contractRef
  );
}

function canonicalDecisionTrace(
  record: Omit<FederationDecisionRecordV1, "recordRef" | "decisionTraceDigest">,
) {
  return {
    federationId: record.federationId,
    missionRef: record.missionRef,
    sourceDomainRef: record.sourceDomainRef,
    destinationDomainRef: record.destinationDomainRef,
    principalRef: record.principalRef,
    productRef: record.productRef,
    contractRef: record.contractRef,
    purpose: record.purpose,
    sourceDecisionRef: record.sourceDecisionRef,
    destinationDecisionRef: record.destinationDecisionRef,
    trustPathProofRef: record.trustPathProofRef,
    trustPathDigest: record.trustPathDigest,
    trustGraphVersion: record.trustGraphVersion,
    trustResolverRef: record.trustResolverRef,
    contractResolutionRef: record.contractResolutionRef,
    contractResolutionDigest: record.contractResolutionDigest,
    destinationAuthorityBindingRef: record.destinationAuthorityBindingRef,
    destinationAuthorityDigest: record.destinationAuthorityDigest,
    authorizationRequestRef: record.authorizationRequestRef,
    riverReservationRef: record.riverReservationRef,
    executionReceiptRef: record.executionReceiptRef,
    observationRef: record.observationRef,
    verifiedEffectRef: record.verifiedEffectRef,
    correlationId: record.correlationId,
    recordedAt: record.recordedAt,
    synthetic: record.synthetic,
    persisted: record.persisted,
  } as const;
}

function recordRefFor(decisionTraceDigest: string): string {
  return `FEDERATION-DECISION-RECORD:${decisionTraceDigest.slice("sha256:".length, "sha256:".length + 32)}`;
}

function validateRecordIntegrity(record: FederationDecisionRecordV1): boolean {
  const { recordRef: _recordRef, decisionTraceDigest: _decisionTraceDigest, ...traceInput } = record;
  const expectedTrace = digestRef(canonicalDecisionTrace(traceInput));
  return (
    record.decisionTraceDigest === expectedTrace &&
    record.recordRef === recordRefFor(expectedTrace)
  );
}

function cloneRecord(record: FederationDecisionRecordV1): FederationDecisionRecordV1 {
  return { ...record };
}

export function buildFederationDecisionRecordV1(input: {
  federationObject: LicenceFederationObjectV1;
  trustPathProof: TrustPathProofV1;
  contractResolution: FederationContractResolutionV1;
  destinationAuthorityBinding: DestinationFederationAuthorityBindingV1;
  destinationDecision: WardenDecisionV1;
  governed: FederatedLicenceEvidenceSuccessV1;
  recordedAt: string;
}): FederationDecisionRecordBuildResultV1 {
  const {
    federationObject,
    trustPathProof,
    contractResolution,
    destinationAuthorityBinding,
    destinationDecision,
    governed,
    recordedAt,
  } = input;

  if (!completeTrustProvenance(trustPathProof)) {
    return { ok: false, reasonCode: "DECISION_RECORD_TRUST_PROVENANCE_REQUIRED" };
  }
  if (!provenanceDigestIsValid(trustPathProof)) {
    return { ok: false, reasonCode: "DECISION_RECORD_TRUST_PROVENANCE_INVALID" };
  }
  if (!lineageMatches(input)) {
    return { ok: false, reasonCode: "DECISION_RECORD_LINEAGE_MISMATCH" };
  }

  const recorded = parseInstant(recordedAt);
  const verified = parseInstant(governed.verification.effect.verifiedAt);
  if (recorded === null || verified === null || recorded < verified) {
    return { ok: false, reasonCode: "DECISION_RECORD_TIME_INVALID" };
  }

  const authorization = buildFederationAuthorizationBindingV1({
    federationObject,
    trustPathProof,
    contractResolution,
    destinationAuthorityBinding,
  });
  const contractResolutionDigest = stripDigestNamespace(
    authorization.contractResolutionDigestRef,
    "FED-CONTRACT-RESOLUTION-DIGEST:",
  );
  const destinationAuthorityDigest = stripDigestNamespace(
    authorization.destinationAuthorityDigestRef,
    "FED-AUTHORITY-DIGEST:",
  );
  if (!contractResolutionDigest || !destinationAuthorityDigest) {
    return { ok: false, reasonCode: "DECISION_RECORD_LINEAGE_MISMATCH" };
  }

  const traceInput: Omit<FederationDecisionRecordV1, "recordRef" | "decisionTraceDigest"> = {
    federationId: federationObject.federationId,
    missionRef: federationObject.missionRef,
    sourceDomainRef: federationObject.sourceDomainRef,
    destinationDomainRef: federationObject.destinationDomainRef,
    principalRef: federationObject.principalRef,
    productRef: federationObject.productRef,
    contractRef: federationObject.contractRef,
    purpose: federationObject.purpose,
    sourceDecisionRef: federationObject.sourceWardenDecisionRef,
    destinationDecisionRef: destinationDecision.decisionRef,
    trustPathProofRef: trustPathProof.proofRef,
    trustPathDigest: trustPathProof.resolutionDigest,
    trustGraphVersion: trustPathProof.graphVersion,
    trustResolverRef: trustPathProof.resolverRef,
    contractResolutionRef: contractResolution.resolutionRef,
    contractResolutionDigest,
    destinationAuthorityBindingRef: destinationAuthorityBinding.bindingRef,
    destinationAuthorityDigest,
    authorizationRequestRef: authorization.requestRef,
    riverReservationRef: governed.reservation.reservationRef,
    executionReceiptRef: governed.execution.receiptRef,
    observationRef: governed.observation.observationRef,
    verifiedEffectRef: governed.verification.effect.effectRef,
    correlationId: governed.execution.correlationId,
    recordedAt,
    synthetic: true,
    persisted: false,
  };
  const decisionTraceDigest = digestRef(canonicalDecisionTrace(traceInput));
  const record: FederationDecisionRecordV1 = {
    recordRef: recordRefFor(decisionTraceDigest),
    ...traceInput,
    decisionTraceDigest,
  };

  return { ok: true, record };
}

export class AppendOnlyFederationDecisionRecordStoreV1 {
  private readonly byFederationId = new Map<string, FederationDecisionRecordV1>();

  append(record: FederationDecisionRecordV1): FederationDecisionRecordAppendResultV1 {
    if (!validateRecordIntegrity(record)) {
      return {
        state: "REJECTED",
        federationId: record.federationId,
        reasonCode: "DECISION_RECORD_INTEGRITY_MISMATCH",
      };
    }

    const existing = this.byFederationId.get(record.federationId);
    if (existing) {
      if (
        existing.recordRef !== record.recordRef ||
        existing.decisionTraceDigest !== record.decisionTraceDigest
      ) {
        return {
          state: "REJECTED",
          federationId: record.federationId,
          reasonCode: "DECISION_RECORD_APPEND_CONFLICT",
        };
      }
      return {
        state: "APPENDED",
        record: cloneRecord(existing),
        idempotentReplay: true,
      };
    }

    this.byFederationId.set(record.federationId, cloneRecord(record));
    return {
      state: "APPENDED",
      record: cloneRecord(record),
      idempotentReplay: false,
    };
  }

  recordCount(): number {
    return this.byFederationId.size;
  }

  recordForFederation(federationId: string): FederationDecisionRecordV1 | undefined {
    const record = this.byFederationId.get(federationId);
    return record ? cloneRecord(record) : undefined;
  }
}
