import { createHash } from "node:crypto";

import type { Rc1EvidenceEntry } from "../../rc1/runtime.ts";
import {
  assertProofReferenceIntegrityV1,
  createGenesisDeviceProofReferenceV1,
  createRiverReservationProofReferenceV1,
  createRiverRuntimeCompositeProofReferenceV1,
  createRiverSealProofReferenceV1,
  createSynnergyzeCompositionProofReferenceV1,
  createSynnergyzeExecutionProofReferenceV1,
  createSynnergyzeVerificationProofReferenceV1,
  createWardenAuthorizationProofReferenceV1,
  type ProofReferenceV1,
} from "../proof/proof-reference.ts";
import type { CausalTraceV1 } from "../river/contracts.ts";
import { adaptRc1CausalTrace, adaptRc1EvidenceSeal } from "../river/rc1-adapter.ts";
import {
  buildAuthorizedActionEnvelopeV1,
  SyntheticRiverReservationServiceV1,
} from "../river/reservation-service.ts";
import type {
  WardenDecisionRequestV1,
  WardenExecutionCheckpointV1,
} from "../warden/contracts.ts";
import {
  evaluateSyntheticWardenDecisionV1,
  type SyntheticWardenDecisionPolicyV1,
} from "../warden/decision-service.ts";
import type { ResolvedDeviceSecurityContextV1 } from "./contracts.ts";
import {
  EffectVerificationServiceV1,
  SyntheticServiceRequestObservationSourceV1,
  type PostExecutionObservationSourceV1,
} from "./effect-verification.ts";
import {
  ControlledExecutionGateV1,
  SyntheticServiceRequestCreateAdapterV1,
} from "./execution-gate.ts";

export interface RuntimeActivationTimelineV1 {
  decidedAt: string;
  reservedAt: string;
  checkedAt: string;
  executedAt: string;
  observedAt: string;
  verifiedAt: string;
}

export interface SynnergyzeRuntimeActivationInputV1 {
  request: WardenDecisionRequestV1;
  policy: SyntheticWardenDecisionPolicyV1;
  executionDeviceSecurity: ResolvedDeviceSecurityContextV1;
  estateScopeRef: string;
  groupScopeRef: string;
  timeline: RuntimeActivationTimelineV1;
}

export interface SynnergyzeRuntimeActivationResultV1 {
  state: "CONTROLLED_ACTIVE_PROOF" | "BLOCKED";
  proofChain: readonly ProofReferenceV1[];
  compositeProof?: ProofReferenceV1;
  requestRef: string;
  correlationId: string;
  externalEffects: false;
  settlementFinality: false;
  registryTruthPromoted: false;
  blockedReason?: string;
}

export interface RuntimeActivationDependenciesV1 {
  observer?: PostExecutionObservationSourceV1;
  causalTraceFactory?: (
    correlationId: string,
    entries: readonly Rc1EvidenceEntry[],
  ) => CausalTraceV1;
}

interface StoredRuntimeActivationV1 {
  fingerprint: string;
  result: SynnergyzeRuntimeActivationResultV1;
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function stableUnique(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter(Boolean))].sort();
}

function parseInstant(value: string): number | undefined {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function canonicalRequest(request: WardenDecisionRequestV1) {
  return {
    ...request,
    authorityRefs: stableUnique(request.authorityRefs),
    policyRefs: stableUnique(request.policyRefs),
    representationSourceRefs: stableUnique(request.representationSourceRefs),
    genesisDevice: request.genesisDevice
      ? {
          ...request.genesisDevice,
          evidenceRefs: stableUnique(request.genesisDevice.evidenceRefs),
        }
      : null,
    deviceSecuritySourceRefs: stableUnique(request.deviceSecuritySourceRefs ?? []),
  };
}

function canonicalPolicy(policy: SyntheticWardenDecisionPolicyV1) {
  return {
    ...policy,
    requiredAuthorityRefs: stableUnique(policy.requiredAuthorityRefs),
    requiredPolicyRefs: stableUnique(policy.requiredPolicyRefs),
    allowedCapabilityRefs: stableUnique(policy.allowedCapabilityRefs),
    manualReviewCapabilityRefs: stableUnique(policy.manualReviewCapabilityRefs),
    constraints: stableUnique(policy.constraints),
    deviceRequirement: policy.deviceRequirement ?? null,
  };
}

function runtimeFingerprint(input: SynnergyzeRuntimeActivationInputV1): string {
  return digest(
    JSON.stringify({
      request: canonicalRequest(input.request),
      policy: canonicalPolicy(input.policy),
      executionDeviceSecurity: {
        resolutionRef: input.executionDeviceSecurity.resolutionRef,
        deviceRef: input.executionDeviceSecurity.deviceRef,
        state: input.executionDeviceSecurity.state,
        policyRef: input.executionDeviceSecurity.policyRef ?? null,
        evidenceRef: input.executionDeviceSecurity.evidenceRef,
        assuranceLevel: input.executionDeviceSecurity.assuranceLevel ?? null,
        resolvedAt: input.executionDeviceSecurity.resolvedAt,
        validUntil: input.executionDeviceSecurity.validUntil ?? null,
      },
      estateScopeRef: input.estateScopeRef,
      groupScopeRef: input.groupScopeRef,
    }),
  );
}

function blocked(
  request: WardenDecisionRequestV1,
  proofChain: readonly ProofReferenceV1[],
  blockedReason: string,
): SynnergyzeRuntimeActivationResultV1 {
  return {
    state: "BLOCKED",
    proofChain: [...proofChain],
    requestRef: request.requestRef,
    correlationId: request.correlationId,
    externalEffects: false,
    settlementFinality: false,
    registryTruthPromoted: false,
    blockedReason,
  };
}

function validateTimeline(input: SynnergyzeRuntimeActivationInputV1): string | undefined {
  const requestedAt = parseInstant(input.request.requestedAt);
  const values = [
    requestedAt,
    parseInstant(input.timeline.decidedAt),
    parseInstant(input.timeline.reservedAt),
    parseInstant(input.timeline.checkedAt),
    parseInstant(input.timeline.executedAt),
    parseInstant(input.timeline.observedAt),
    parseInstant(input.timeline.verifiedAt),
  ];
  if (values.some((value) => value === undefined)) return "runtime_activation_time_invalid";
  for (let index = 1; index < values.length; index += 1) {
    if ((values[index] as number) < (values[index - 1] as number)) {
      return "runtime_activation_time_order_invalid";
    }
  }
  return undefined;
}

function validateDeviceBoundary(input: SynnergyzeRuntimeActivationInputV1): string | undefined {
  const { request, executionDeviceSecurity } = input;
  if (!request.executionDeviceRef) return "runtime_activation_execution_device_required";
  if (!request.genesisDevice) return "runtime_activation_genesis_device_required";
  if (
    request.genesisDevice.deviceRef !== request.executionDeviceRef ||
    request.genesisDevice.estateRef !== input.estateScopeRef
  ) {
    return "runtime_activation_genesis_device_mismatch";
  }
  if (
    executionDeviceSecurity.deviceRef !== request.executionDeviceRef ||
    executionDeviceSecurity.state !== "ACTIVE"
  ) {
    return "runtime_activation_device_security_mismatch";
  }
  if (
    request.deviceSecurityState !== "ACTIVE" ||
    request.deviceSecurityPolicyRef !== executionDeviceSecurity.policyRef ||
    request.deviceSecurityResolvedAt !== executionDeviceSecurity.resolvedAt ||
    request.deviceSecurityValidUntil !== executionDeviceSecurity.validUntil
  ) {
    return "runtime_activation_device_security_mismatch";
  }
  const sources = new Set(request.deviceSecuritySourceRefs ?? []);
  if (
    !sources.has(executionDeviceSecurity.resolutionRef) ||
    !sources.has(executionDeviceSecurity.evidenceRef)
  ) {
    return "runtime_activation_device_security_mismatch";
  }
  return undefined;
}

function buildRc1ConformanceEntries(
  reservationRef: string,
  effectRef: string,
  correlationId: string,
  decisionRef: string,
): readonly Rc1EvidenceEntry[] {
  const capability = "service_request.create" as const;
  const sealEvidenceRef = `RIVER-EVIDENCE-SEALED:${digest(
    `${reservationRef}|${effectRef}|${correlationId}`,
  ).slice(0, 24)}`;
  return [
    {
      evidenceRef: reservationRef,
      correlationId,
      stage: "RESERVED",
      capability,
      decisionRef,
    },
    {
      evidenceRef: sealEvidenceRef,
      correlationId,
      stage: "SEALED",
      capability,
      decisionRef,
      effectRef,
    },
  ];
}

export class SynnergyzeRuntimeActivationServiceV1 {
  private readonly river = new SyntheticRiverReservationServiceV1();
  private readonly adapter = new SyntheticServiceRequestCreateAdapterV1();
  private readonly gate = new ControlledExecutionGateV1([this.adapter]);
  private readonly verifier = new EffectVerificationServiceV1();
  private readonly observer: PostExecutionObservationSourceV1;
  private readonly causalTraceFactory: RuntimeActivationDependenciesV1["causalTraceFactory"];
  private readonly byRequestRef = new Map<string, StoredRuntimeActivationV1>();

  constructor(dependencies: RuntimeActivationDependenciesV1 = {}) {
    this.observer = dependencies.observer ?? new SyntheticServiceRequestObservationSourceV1();
    this.causalTraceFactory = dependencies.causalTraceFactory ?? adaptRc1CausalTrace;
  }

  execute(input: SynnergyzeRuntimeActivationInputV1): SynnergyzeRuntimeActivationResultV1 {
    const fingerprint = runtimeFingerprint(input);
    const existing = this.byRequestRef.get(input.request.requestRef);
    if (existing) {
      if (existing.fingerprint !== fingerprint) throw new Error("runtime_activation_replay_conflict");
      return structuredClone(existing.result);
    }

    const save = (result: SynnergyzeRuntimeActivationResultV1) => {
      this.byRequestRef.set(input.request.requestRef, {
        fingerprint,
        result: structuredClone(result),
      });
      return structuredClone(result);
    };

    const deviceFailure = validateDeviceBoundary(input);
    if (deviceFailure) return save(blocked(input.request, [], deviceFailure));
    const timeFailure = validateTimeline(input);
    if (timeFailure) return save(blocked(input.request, [], timeFailure));

    const genesisDevice = input.request.genesisDevice!;
    const genesisProof = createGenesisDeviceProofReferenceV1({
      subjectRef: genesisDevice.deviceRef,
      scope: "ESTATE",
      scopeRef: input.estateScopeRef,
      sourceRefs: [
        genesisDevice.resolutionRef,
        genesisDevice.attestationRef,
        ...genesisDevice.evidenceRefs,
      ],
      createdAt: genesisDevice.resolvedAt,
      synthetic: true,
    });
    const compositionProof = createSynnergyzeCompositionProofReferenceV1({
      subjectRef: input.request.requestRef,
      scope: "ESTATE",
      scopeRef: input.estateScopeRef,
      sourceRefs: [
        input.request.programRef,
        input.request.eventRef,
        ...input.request.representationSourceRefs,
        genesisProof.proofId,
      ],
      createdAt: input.request.requestedAt,
      synthetic: true,
    });
    const initialProofs = [genesisProof, compositionProof] as const;

    const decision = evaluateSyntheticWardenDecisionV1({
      request: input.request,
      policy: input.policy,
      decidedAt: input.timeline.decidedAt,
    });
    if (decision.decision !== "ALLOW") {
      return save(
        blocked(
          input.request,
          initialProofs,
          `runtime_activation_warden_${decision.decision.toLowerCase()}`,
        ),
      );
    }

    const wardenProof = createWardenAuthorizationProofReferenceV1({
      subjectRef: decision.decisionRef,
      scope: "ESTATE",
      scopeRef: input.estateScopeRef,
      sourceRefs: [
        input.request.requestRef,
        ...input.request.authorityRefs,
        ...input.request.policyRefs,
        genesisProof.proofId,
        compositionProof.proofId,
      ],
      createdAt: decision.decidedAt,
      synthetic: true,
    });

    const action = buildAuthorizedActionEnvelopeV1(input.request, decision);
    const reservation = this.river.reserve({
      request: input.request,
      decision,
      action,
      reservedAt: input.timeline.reservedAt,
    });
    const reservationProof = createRiverReservationProofReferenceV1({
      subjectRef: reservation.reservationRef,
      scope: "ESTATE",
      scopeRef: input.estateScopeRef,
      sourceRefs: [
        action.actionRef,
        decision.decisionRef,
        reservation.authorizationDigest,
        action.genesisDeviceRequestDigest!,
        wardenProof.proofId,
      ],
      createdAt: reservation.reservedAt,
      synthetic: true,
    });

    const checkpoint: WardenExecutionCheckpointV1 = {
      checkpointRef: `WARDEN-EXEC-CHECK:${digest(
        [decision.decisionRef, reservation.reservationRef, input.timeline.checkedAt].join("|"),
      ).slice(0, 24)}`,
      decisionRef: decision.decisionRef,
      wardenRef: decision.wardenRef,
      correlationId: decision.correlationId,
      state: "VALID",
      checkedAt: input.timeline.checkedAt,
      reasonCodes: ["runtime_activation_r0.1_checkpoint_valid"],
    };

    const executionReceipt = this.gate.execute({
      action,
      reservation,
      decision,
      checkpoint,
      executionDeviceSecurity: input.executionDeviceSecurity,
      executedAt: input.timeline.executedAt,
    });
    const executionProof = createSynnergyzeExecutionProofReferenceV1({
      subjectRef: executionReceipt.receiptRef,
      scope: "ESTATE",
      scopeRef: input.estateScopeRef,
      sourceRefs: [
        action.actionRef,
        reservation.reservationRef,
        decision.decisionRef,
        checkpoint.checkpointRef,
        executionReceipt.adapterRef,
        executionReceipt.adapterResultRef,
        reservationProof.proofId,
      ],
      createdAt: executionReceipt.executedAt,
      synthetic: true,
    });

    const preVerificationProofs = [
      genesisProof,
      compositionProof,
      wardenProof,
      reservationProof,
      executionProof,
    ] as const;

    const observation = this.observer.observe(executionReceipt, input.timeline.observedAt);
    const verification = this.verifier.verify({
      receipt: executionReceipt,
      observation,
      verifiedAt: input.timeline.verifiedAt,
    });
    if (verification.state !== "VERIFIED_EFFECT") {
      return save(
        blocked(
          input.request,
          preVerificationProofs,
          "runtime_activation_effect_verification_exception",
        ),
      );
    }

    const verificationProof = createSynnergyzeVerificationProofReferenceV1({
      subjectRef: verification.effect.effectRef,
      scope: "ESTATE",
      scopeRef: input.estateScopeRef,
      sourceRefs: [
        verification.effect.verificationRef,
        observation.observationRef,
        observation.sourceEvidenceRef,
        executionReceipt.receiptRef,
        executionProof.proofId,
      ],
      createdAt: verification.effect.verifiedAt,
      synthetic: true,
    });

    const entries = buildRc1ConformanceEntries(
      reservation.reservationRef,
      verification.effect.effectRef,
      input.request.correlationId,
      decision.decisionRef,
    );
    const seal = adaptRc1EvidenceSeal(reservation, verification.effect, entries);
    const causalTrace = this.causalTraceFactory!(input.request.correlationId, entries);
    if (
      seal.state !== "SEALED" ||
      causalTrace.sealed !== true ||
      causalTrace.reservationRef !== reservation.reservationRef ||
      causalTrace.effectRef !== verification.effect.effectRef ||
      causalTrace.sealRef !== seal.sealRef
    ) {
      return save(
        blocked(
          input.request,
          [...preVerificationProofs, verificationProof],
          "runtime_activation_causal_trace_mismatch",
        ),
      );
    }

    const sealProof = createRiverSealProofReferenceV1({
      subjectRef: seal.sealRef,
      scope: "ESTATE",
      scopeRef: input.estateScopeRef,
      sourceRefs: [
        seal.reservationRef,
        verification.effect.effectRef,
        seal.traceDigest,
        causalTrace.sealRef,
        verificationProof.proofId,
      ],
      createdAt: seal.sealedAt,
      synthetic: true,
    });

    const proofChain = [
      genesisProof,
      compositionProof,
      wardenProof,
      reservationProof,
      executionProof,
      verificationProof,
      sealProof,
    ] as const;
    for (const proof of proofChain) assertProofReferenceIntegrityV1(proof);

    const compositeProof = createRiverRuntimeCompositeProofReferenceV1({
      subjectRef: input.request.correlationId,
      scope: "GROUP",
      scopeRef: input.groupScopeRef,
      sourceRefs: [
        ...proofChain.map((proof) => proof.proofId),
        seal.sealRef,
        seal.traceDigest,
        causalTrace.reservationRef,
        causalTrace.effectRef,
      ],
      createdAt: seal.sealedAt,
      synthetic: true,
    });
    assertProofReferenceIntegrityV1(compositeProof);

    return save({
      state: "CONTROLLED_ACTIVE_PROOF",
      proofChain,
      compositeProof,
      requestRef: input.request.requestRef,
      correlationId: input.request.correlationId,
      externalEffects: false,
      settlementFinality: false,
      registryTruthPromoted: false,
    });
  }

  adapterInvocationCount(): number {
    return this.adapter.invocationCount();
  }
}
