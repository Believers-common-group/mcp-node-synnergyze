import { createHash } from "node:crypto";

import type { BnrPartnerReadinessStateV1 } from "../../bnr/contracts.ts";
import type { AmazonBnrNodeManifestV1 } from "./bnr-node-001.ts";

export interface AmazonBnrReadinessOutboxPayloadV1 {
  nodeRef: "BNR-001";
  partnerRef: "PARTNER:AMAZON";
  partnerLifecycle: BnrPartnerReadinessStateV1["partnerLifecycle"];
  runtimeReadiness: BnrPartnerReadinessStateV1["runtimeReadiness"];
  authorityState: BnrPartnerReadinessStateV1["authorityState"];
  evidenceState: BnrPartnerReadinessStateV1["evidenceState"];
  commercialState: BnrPartnerReadinessStateV1["commercialState"];
  activationState: BnrPartnerReadinessStateV1["activationState"];
  blockers: readonly string[];
  authorityEvidenceRefs: readonly string[];
  commercialEvidenceRefs: readonly string[];
  technicalEvidenceRefs: readonly string[];
  activationEvidenceRefs: readonly string[];
  riverSealClaimed: false;
}

export interface AmazonBnrReadinessOutboxEnvelopeV1 {
  eventReference: string;
  sourceNodeCode: "CWR-REGISTRY";
  changeCode: "EVALUATE";
  eventCode: "BNR_NODE_READINESS_EVALUATED";
  objectType: "BNR_NODE";
  objectCode: "BNR-001";
  registryRevisionRef: string;
  evidenceReference: null;
  occurredAt: string;
  deliveryState: "pending";
  payload: AmazonBnrReadinessOutboxPayloadV1;
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function buildAmazonBnrReadinessOutboxV1(input: {
  manifest: Readonly<AmazonBnrNodeManifestV1>;
  readiness: BnrPartnerReadinessStateV1;
  registryRevisionRef: string;
}): AmazonBnrReadinessOutboxEnvelopeV1 {
  if (input.manifest.nodeRef !== "BNR-001" || input.readiness.nodeRef !== "BNR-001") {
    throw new Error("amazon_bnr_readiness_node_mismatch");
  }

  const payload: AmazonBnrReadinessOutboxPayloadV1 = {
    nodeRef: "BNR-001",
    partnerRef: "PARTNER:AMAZON",
    partnerLifecycle: input.readiness.partnerLifecycle,
    runtimeReadiness: input.readiness.runtimeReadiness,
    authorityState: input.readiness.authorityState,
    evidenceState: input.readiness.evidenceState,
    commercialState: input.readiness.commercialState,
    activationState: input.readiness.activationState,
    blockers: [...input.readiness.blockers],
    authorityEvidenceRefs: [...input.manifest.authorityEvidenceRefs],
    commercialEvidenceRefs: [...input.manifest.commercialEvidenceRefs],
    technicalEvidenceRefs: [...input.manifest.technicalEvidenceRefs],
    activationEvidenceRefs: [...input.manifest.activationEvidenceRefs],
    riverSealClaimed: false,
  };

  const eventIdentity = JSON.stringify({
    sourceNodeCode: "CWR-REGISTRY",
    eventCode: "BNR_NODE_READINESS_EVALUATED",
    objectCode: "BNR-001",
    registryRevisionRef: input.registryRevisionRef,
    occurredAt: input.readiness.readinessCheckedAt,
    payload,
  });

  return {
    eventReference: `REGISTRY-EVENT:BNR-001:${digest(eventIdentity).slice(0, 24)}`,
    sourceNodeCode: "CWR-REGISTRY",
    changeCode: "EVALUATE",
    eventCode: "BNR_NODE_READINESS_EVALUATED",
    objectType: "BNR_NODE",
    objectCode: "BNR-001",
    registryRevisionRef: input.registryRevisionRef,
    evidenceReference: null,
    occurredAt: input.readiness.readinessCheckedAt,
    deliveryState: "pending",
    payload,
  };
}
