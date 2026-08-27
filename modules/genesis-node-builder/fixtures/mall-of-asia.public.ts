import type {
  CandidateClaimV1,
  CandidateEvidenceV1,
  CandidateIdentityV1,
  GenesisCandidateV1,
} from "../contracts.ts";

export interface MallOfAsiaPublicFixtureV1 {
  referenceAssetRef: "GENESIS-REFERENCE-ASSET-MOA-001";
  referenceAssetStatus: "PUBLIC-EVIDENCE PROTOTYPE — NOT AUTHORITATIVE PROPERTY RECORD";
  candidate: GenesisCandidateV1;
  identities: readonly CandidateIdentityV1[];
  evidence: readonly CandidateEvidenceV1[];
  claims: readonly CandidateClaimV1[];
}

export const MALL_OF_ASIA_PUBLIC_FIXTURE_V1 = {
  referenceAssetRef: "GENESIS-REFERENCE-ASSET-MOA-001",
  referenceAssetStatus: "PUBLIC-EVIDENCE PROTOTYPE — NOT AUTHORITATIVE PROPERTY RECORD",
  candidate: {
    candidateRef: "GENESIS-CANDIDATE:MOA-PUBLIC-001",
    candidateType: "PROPERTY",
    displayName: "Phoenix Mall of Asia",
    jurisdictionRef: "JURISDICTION:KA-BLR",
    assetClass: "MALL",
    lifecycle: "DISCOVERED",
    createdAt: "2026-08-28T00:00:00Z",
    sourceEvidenceRefs: ["EVIDENCE:MOA:PUBLIC:PROJECT"],
    correlationId: "CORR:MOA-PUBLIC-001",
  },
  identities: [
    {
      identityRef: "IDENTITY:MOA:ADDRESS",
      candidateRef: "GENESIS-CANDIDATE:MOA-PUBLIC-001",
      kind: "ADDRESS",
      normalizedValue: "Byatarayanapura, Yelahanka Hobli, Bengaluru, Karnataka",
      sourceEvidenceRefs: ["EVIDENCE:MOA:PUBLIC:PROJECT"],
      observedAt: "2026-08-28T00:00:00Z",
    },
  ],
  evidence: [
    {
      evidenceRef: "EVIDENCE:MOA:PUBLIC:PROJECT",
      candidateRef: "GENESIS-CANDIDATE:MOA-PUBLIC-001",
      evidenceClass: "PROPERTY_IDENTITY_RECORD",
      sourceSystemRef: "PUBLIC:PHOENIX:ASSET-DISCLOSURE",
      retrievedAt: "2026-08-28T00:00:00Z",
      evidenceState: "VALIDATED",
      accessClass: "PUBLIC",
      sourceLocatorRef: "PUBLIC-REF:PHOENIX-MOA-PROJECT",
    },
    {
      evidenceRef: "EVIDENCE:MOA:PUBLIC:JURISDICTION",
      candidateRef: "GENESIS-CANDIDATE:MOA-PUBLIC-001",
      evidenceClass: "JURISDICTION_RECORD",
      sourceSystemRef: "PUBLIC:PHOENIX:ADDRESS-DISCLOSURE",
      retrievedAt: "2026-08-28T00:00:00Z",
      evidenceState: "VALIDATED",
      accessClass: "PUBLIC",
      sourceLocatorRef: "PUBLIC-REF:PHOENIX-MOA-ADDRESS",
    },
    {
      evidenceRef: "EVIDENCE:MOA:PUBLIC:CORPORATE-AREA",
      candidateRef: "GENESIS-CANDIDATE:MOA-PUBLIC-001",
      evidenceClass: "PUBLIC_CORPORATE_DISCLOSURE",
      sourceSystemRef: "PUBLIC:PHOENIX:CORPORATE-DISCLOSURE",
      retrievedAt: "2026-08-28T00:00:00Z",
      evidenceState: "VALIDATED",
      accessClass: "PUBLIC",
      sourceLocatorRef: "PUBLIC-REF:PHOENIX-MOA-SITE-EXTENT",
    },
    {
      evidenceRef: "EVIDENCE:MOA:PUBLIC:GIS-APPROX",
      candidateRef: "GENESIS-CANDIDATE:MOA-PUBLIC-001",
      evidenceClass: "PUBLIC_GIS_OBSERVATION",
      sourceSystemRef: "PUBLIC:GIS:APPROXIMATION",
      retrievedAt: "2026-08-28T00:00:00Z",
      evidenceState: "VALIDATED",
      accessClass: "PUBLIC",
      sourceLocatorRef: "PUBLIC-REF:MOA-GIS-APPROXIMATION",
    },
  ],
  claims: [
    {
      claimRef: "CLAIM:MOA:PUBLIC:SITE-AREA",
      candidateRef: "GENESIS-CANDIDATE:MOA-PUBLIC-001",
      claimType: "PROPERTY_ATTRIBUTE",
      subjectRef: "GENESIS-CANDIDATE:MOA-PUBLIC-001",
      predicate: "site_area_acres",
      value: "13",
      valueUnit: "acre",
      sourceEvidenceRefs: ["EVIDENCE:MOA:PUBLIC:CORPORATE-AREA"],
      claimState: "CORROBORATED_PUBLIC",
      confidenceBand: "MEDIUM",
    },
    {
      claimRef: "CLAIM:MOA:INFERRED:GIS-SITE-AREA",
      candidateRef: "GENESIS-CANDIDATE:MOA-PUBLIC-001",
      claimType: "PROPERTY_ATTRIBUTE",
      subjectRef: "GENESIS-CANDIDATE:MOA-PUBLIC-001",
      predicate: "site_area_acres",
      value: "12.8",
      valueUnit: "acre",
      sourceEvidenceRefs: ["EVIDENCE:MOA:PUBLIC:GIS-APPROX"],
      claimState: "INFERRED",
      confidenceBand: "LOW",
    },
  ],
} as const satisfies MallOfAsiaPublicFixtureV1;
