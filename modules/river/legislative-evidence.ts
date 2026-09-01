import { sha256CanonicalV1 } from "../legislative-intelligence/canonical.ts";
import type {
  NormalizedLegislativeEventV1,
  SourceEnvelopeV1,
} from "../legislative-intelligence/contracts.ts";
import type { ImpactBriefV1, PestelSignalV1 } from "../pestel/contracts.ts";

export interface LegislativeEvidenceReceiptV1 {
  schemaVersion: "RIVER-LEG-EVIDENCE:R0.1";
  evidenceRef: string;
  runRef: string;
  sourceSystem: "congress.gov";
  sourceObjectIds: readonly string[];
  credentialAdmissionRef: "CONGRESS-GOV-API-KEY-001";
  credentialFingerprintPrefix?: string;
  requestStatuses: readonly number[];
  rateLimitObservations: readonly { limit?: number; remaining?: number }[];
  rawSourceDigests: readonly string[];
  normalizedEventDigest: string;
  lifecycleNormalizerVersion: "LEG-NORMALIZER:R0.1";
  classifierVersion: string;
  mappingPolicyVersion: "REGISTRY-IMPACT:R0.1";
  outputBriefDigest: string;
  observedAt: string;
  persistenceState: "LOCAL_DOMAIN_RECEIPT";
}

export interface BuildLegislativeEvidenceReceiptInputV1 {
  runRef: string;
  sources: readonly SourceEnvelopeV1[];
  event: NormalizedLegislativeEventV1;
  signal: PestelSignalV1;
  brief: ImpactBriefV1;
  observedAt: string;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function assertEvidenceLinkage(input: BuildLegislativeEvidenceReceiptInputV1): void {
  if (input.signal.legislativeEventRef !== input.event.eventRef) {
    throw new Error("river_legislative_signal_event_mismatch");
  }
  if (input.brief.signalRef !== input.signal.signalRef) {
    throw new Error("river_legislative_brief_signal_mismatch");
  }
}

export function buildLegislativeEvidenceReceiptV1(
  input: BuildLegislativeEvidenceReceiptInputV1,
): LegislativeEvidenceReceiptV1 {
  assertEvidenceLinkage(input);
  if (input.sources.length === 0) throw new Error("river_legislative_sources_required");
  if (input.sources.some((source) => source.sourceSystem !== "congress.gov")) {
    throw new Error("river_legislative_source_system_mismatch");
  }
  if (input.sources.some((source) => source.credentialAdmissionRef !== "CONGRESS-GOV-API-KEY-001")) {
    throw new Error("river_legislative_credential_admission_mismatch");
  }

  const fingerprintPrefixes = uniqueSorted(
    input.sources
      .map((source) => source.credentialFingerprintPrefix)
      .filter((value): value is string => typeof value === "string" && value.length > 0),
  );
  if (fingerprintPrefixes.length > 1) {
    throw new Error("river_legislative_credential_fingerprint_mismatch");
  }

  const sourceObjectIds = uniqueSorted(input.sources.map((source) => source.sourceObjectId));
  const requestStatuses = [...new Set(input.sources.map((source) => source.httpStatus))].sort((a, b) => a - b);
  const rateLimitObservations = input.sources
    .filter(
      (source) => source.rateLimitLimit !== undefined || source.rateLimitRemaining !== undefined,
    )
    .map((source) => ({
      ...(source.rateLimitLimit !== undefined ? { limit: source.rateLimitLimit } : {}),
      ...(source.rateLimitRemaining !== undefined ? { remaining: source.rateLimitRemaining } : {}),
    }))
    .sort((a, b) => `${a.limit ?? ""}:${a.remaining ?? ""}`.localeCompare(`${b.limit ?? ""}:${b.remaining ?? ""}`));
  const rawSourceDigests = uniqueSorted(input.sources.map((source) => source.rawSha256));
  const normalizedEventDigest = sha256CanonicalV1(input.event);
  const outputBriefDigest = sha256CanonicalV1(input.brief);

  const substantive = {
    schemaVersion: "RIVER-LEG-EVIDENCE:R0.1" as const,
    runRef: input.runRef,
    sourceSystem: "congress.gov" as const,
    sourceObjectIds,
    credentialAdmissionRef: "CONGRESS-GOV-API-KEY-001" as const,
    ...(fingerprintPrefixes[0] ? { credentialFingerprintPrefix: fingerprintPrefixes[0] } : {}),
    requestStatuses,
    rateLimitObservations,
    rawSourceDigests,
    normalizedEventDigest,
    lifecycleNormalizerVersion: input.event.normalizerVersion,
    classifierVersion: input.signal.classifierVersion,
    mappingPolicyVersion: "REGISTRY-IMPACT:R0.1" as const,
    outputBriefDigest,
    persistenceState: "LOCAL_DOMAIN_RECEIPT" as const,
  };

  return {
    evidenceRef: `RIVER-LEG-EVIDENCE:${sha256CanonicalV1(substantive)}`,
    ...substantive,
    observedAt: input.observedAt,
  };
}
