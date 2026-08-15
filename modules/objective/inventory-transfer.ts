import { createHash } from "node:crypto";

import type { EvidenceReservationV1, EvidenceSealV1 } from "../river/contracts.ts";
import {
  buildAuthorizedActionEnvelopeV1,
  SyntheticRiverReservationServiceV1,
} from "../river/reservation-service.ts";
import {
  EffectVerificationServiceV1,
  type PostExecutionObservationV1,
  type VerifiedEffectV1,
} from "../synnergyze/effect-verification.ts";
import {
  ControlledExecutionGateV1,
  type SyntheticCapabilityAdapterInputV1,
  type SyntheticCapabilityAdapterResultV1,
  type SyntheticCapabilityAdapterV1,
} from "../synnergyze/execution-gate.ts";
import {
  evaluateSyntheticWardenDecisionV1,
  type SyntheticWardenDecisionPolicyV1,
} from "../warden/decision-service.ts";
import type { WardenDecisionRequestV1, WardenExecutionCheckpointV1 } from "../warden/contracts.ts";
import type {
  AcceptanceResultV1,
  InventoryTransferProofV1,
  InventoryTransferSpecV1,
  ObjectiveAuthorityEnvelopeV1,
  ObjectiveEffectV1,
  ObjectiveEventV1,
  ObjectiveProgramBundleV1,
  ObjectiveProjectionV1,
  ObjectiveRefV1,
} from "./contracts.ts";

const TRANSFER_CAPABILITY = "inventory.transfer";
const TRANSFER_ADAPTER = "SYNTHETIC-INVENTORY-TRANSFER-ADAPTER-001";
const INVENTORY_OBSERVER = "SYNTHETIC-INVENTORY-OBSERVER-001";

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function parseInstant(value: string, errorCode: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(errorCode);
  return parsed;
}

function targetRef(spec: InventoryTransferSpecV1): string {
  return `INVENTORY-TRANSFER:${spec.sourceLocationRef}->${spec.destinationLocationRef}:${spec.skuRef}`;
}

function resourceRefs(spec: InventoryTransferSpecV1): readonly string[] {
  return [spec.sourceLocationRef, spec.destinationLocationRef, spec.skuRef];
}

function assertObjectiveAuthority(
  objective: ObjectiveRefV1,
  authority: ObjectiveAuthorityEnvelopeV1,
  spec: InventoryTransferSpecV1,
  compiledAt: string,
): void {
  if (objective.status !== "AUTHORIZED" && objective.status !== "ACTIVE") {
    throw new Error("objective_not_authorized");
  }
  if (authority.decision !== "ALLOW" || authority.state !== "ACTIVE") {
    throw new Error("objective_authority_allow_required");
  }
  if (authority.objectiveRef !== objective.objectiveRef) throw new Error("objective_authority_mismatch");
  if (authority.principalRef !== objective.principalRef) throw new Error("objective_principal_mismatch");
  if (!authority.allowedCapabilityRefs.includes(TRANSFER_CAPABILITY)) {
    throw new Error("objective_transfer_capability_not_allowed");
  }
  for (const resourceRef of resourceRefs(spec)) {
    if (!authority.resourceRefs.includes(resourceRef)) throw new Error(`objective_resource_not_allowed:${resourceRef}`);
  }
  if (spec.quantity <= 0 || !Number.isInteger(spec.quantity)) throw new Error("objective_transfer_quantity_invalid");

  const objectiveFrom = parseInstant(objective.validFrom, "objective_valid_from_invalid");
  const objectiveUntil = parseInstant(objective.validUntil, "objective_valid_until_invalid");
  const authorityFrom = parseInstant(authority.validFrom, "objective_authority_valid_from_invalid");
  const authorityUntil = parseInstant(authority.validUntil, "objective_authority_valid_until_invalid");
  const compiled = parseInstant(compiledAt, "objective_compile_time_invalid");
  if (objectiveUntil < objectiveFrom || authorityUntil < authorityFrom) throw new Error("objective_validity_window_invalid");
  if (compiled < objectiveFrom || compiled > objectiveUntil) throw new Error("objective_outside_validity_window");
  if (compiled < authorityFrom || compiled > authorityUntil) throw new Error("objective_authority_outside_validity_window");
}

const EVENT_TYPES: readonly ObjectiveEventV1["eventType"][] = [
  "RESOLVE_OBJECTIVE",
  "RESOLVE_RESOURCES",
  "PREPARE_TRANSFER",
  "WARDEN_ALLOW",
  "RESERVE_EVIDENCE",
  "DISPATCH",
  "VERIFY_DISPATCH",
  "RECEIVE",
  "VERIFY_RECEIPT",
  "SEAL_EVIDENCE",
  "RECORD_EFFECTS",
  "ACCEPTANCE_CHECK",
  "RECONCILE_PROJECTIONS",
  "CLOSE_OBJECTIVE",
];

export function compileInventoryTransferObjective(input: {
  objective: ObjectiveRefV1;
  authority: ObjectiveAuthorityEnvelopeV1;
  transfer: InventoryTransferSpecV1;
  compiledAt: string;
}): ObjectiveProgramBundleV1 {
  const { objective, authority, transfer, compiledAt } = input;
  assertObjectiveAuthority(objective, authority, transfer, compiledAt);

  const identity = digest(
    [objective.objectiveRef, objective.version, transfer.sourceLocationRef, transfer.destinationLocationRef, transfer.skuRef, transfer.quantity].join("|"),
  ).slice(0, 24);
  const programRef = `OBJECTIVE-PROGRAM:${identity}`;
  const correlationId = `OBJECTIVE-CORR:${identity}`;
  const expectedEffectRefs = [
    `EXPECTED-EFFECT:${objective.objectiveRef}:SOURCE-DECREMENT`,
    `EXPECTED-EFFECT:${objective.objectiveRef}:DESTINATION-INCREMENT`,
  ];
  const requiredEvidenceRefs = authority.evidenceRequirementRefs;
  const events: ObjectiveEventV1[] = EVENT_TYPES.map((eventType, index) => {
    const sequence = index + 1;
    const material = eventType === "PREPARE_TRANSFER" || eventType === "DISPATCH" || eventType === "RECEIVE" || eventType === "RECORD_EFFECTS";
    return {
      eventRef: `OBJECTIVE-EVENT:${identity}:${String(sequence).padStart(2, "0")}`,
      eventType,
      sequence,
      objectiveRef: objective.objectiveRef,
      programRef,
      authorityRef: authority.authorityRef,
      correlationId,
      idempotencyKey: `OBJECTIVE-IDEMPOTENCY:${identity}:${String(sequence).padStart(2, "0")}`,
      capabilityRef: material ? TRANSFER_CAPABILITY : undefined,
      targetRef: material ? targetRef(transfer) : undefined,
      expectedEffectRefs: material ? expectedEffectRefs : [],
      requiredEvidenceRefs: eventType === "DISPATCH" || eventType === "RECEIVE" || eventType === "SEAL_EVIDENCE" ? requiredEvidenceRefs : [],
    };
  });

  return {
    program: {
      programRef,
      objectiveRef: objective.objectiveRef,
      objectiveVersion: objective.version,
      purposeLineageRef: `PURPOSE-LINEAGE:${digest(`${objective.principalRef}|${objective.objectiveRef}|${authority.authorityRef}`).slice(0, 24)}`,
      principalRef: objective.principalRef,
      actorRef: authority.actorRef,
      authorityRef: authority.authorityRef,
      correlationId,
      eventRefs: events.map((event) => event.eventRef),
      transfer,
    },
    events,
  };
}

function inventoryKey(locationRef: string, skuRef: string): string {
  return `${locationRef}|${skuRef}`;
}

export class InMemoryInventoryLedgerV1 {
  private readonly quantities = new Map<string, number>();

  set(locationRef: string, skuRef: string, quantity: number): void {
    if (!Number.isInteger(quantity) || quantity < 0) throw new Error("inventory_quantity_invalid");
    this.quantities.set(inventoryKey(locationRef, skuRef), quantity);
  }

  get(locationRef: string, skuRef: string): number {
    return this.quantities.get(inventoryKey(locationRef, skuRef)) ?? 0;
  }

  transfer(spec: InventoryTransferSpecV1): { sourcePrior: number; sourceNew: number; destinationPrior: number; destinationNew: number } {
    const sourcePrior = this.get(spec.sourceLocationRef, spec.skuRef);
    const destinationPrior = this.get(spec.destinationLocationRef, spec.skuRef);
    if (sourcePrior < spec.quantity) throw new Error("inventory_source_insufficient");
    const sourceNew = sourcePrior - spec.quantity;
    const destinationNew = destinationPrior + spec.quantity;
    this.set(spec.sourceLocationRef, spec.skuRef, sourceNew);
    this.set(spec.destinationLocationRef, spec.skuRef, destinationNew);
    return { sourcePrior, sourceNew, destinationPrior, destinationNew };
  }
}

export class SyntheticInventoryTransferAdapterV1 implements SyntheticCapabilityAdapterV1 {
  readonly adapterRef = TRANSFER_ADAPTER;
  readonly capabilityRef = TRANSFER_CAPABILITY;
  private invocations = 0;

  constructor(
    private readonly ledger: InMemoryInventoryLedgerV1,
    private readonly transferSpec: InventoryTransferSpecV1,
  ) {}

  execute(input: SyntheticCapabilityAdapterInputV1): SyntheticCapabilityAdapterResultV1 {
    if (input.action.capabilityRef !== this.capabilityRef) throw new Error("inventory_adapter_capability_mismatch");
    if (input.action.targetRef !== targetRef(this.transferSpec)) throw new Error("inventory_adapter_target_mismatch");
    const result = this.ledger.transfer(this.transferSpec);
    this.invocations += 1;
    return {
      adapterResultRef: `SYNTHETIC-INVENTORY-TRANSFER:${digest(
        [input.action.actionRef, result.sourcePrior, result.sourceNew, result.destinationPrior, result.destinationNew].join("|"),
      ).slice(0, 24)}`,
    };
  }

  invocationCount(): number {
    return this.invocations;
  }
}

export function observeInventoryTransfer(input: {
  receipt: { receiptRef: string; actionRef: string; programRef: string; eventRef: string; targetRef: string; correlationId: string; executedAt: string };
  ledger: InMemoryInventoryLedgerV1;
  transfer: InventoryTransferSpecV1;
  sourcePrior: number;
  destinationPrior: number;
  observedAt: string;
}): PostExecutionObservationV1 {
  const { receipt, ledger, transfer, sourcePrior, destinationPrior, observedAt } = input;
  const executed = parseInstant(receipt.executedAt, "inventory_execution_time_invalid");
  const observed = parseInstant(observedAt, "inventory_observation_time_invalid");
  if (observed < executed) throw new Error("inventory_observation_before_execution");

  const sourceNew = ledger.get(transfer.sourceLocationRef, transfer.skuRef);
  const destinationNew = ledger.get(transfer.destinationLocationRef, transfer.skuRef);
  if (sourceNew !== sourcePrior - transfer.quantity || destinationNew !== destinationPrior + transfer.quantity) {
    throw new Error("inventory_read_after_write_mismatch");
  }
  const observedStateRef = `INVENTORY-TRANSFER-OBSERVED:${digest(
    [transfer.skuRef, sourcePrior, sourceNew, destinationPrior, destinationNew].join("|"),
  ).slice(0, 24)}`;
  const evidenceRef = `INVENTORY-OBSERVATION-EVIDENCE:${digest(`${receipt.receiptRef}|${observedStateRef}|${observedAt}`).slice(0, 24)}`;
  return {
    observationRef: `INVENTORY-OBSERVATION:${digest(`${receipt.receiptRef}|${evidenceRef}`).slice(0, 24)}`,
    executionReceiptRef: receipt.receiptRef,
    actionRef: receipt.actionRef,
    programRef: receipt.programRef,
    eventRef: receipt.eventRef,
    targetRef: receipt.targetRef,
    correlationId: receipt.correlationId,
    observerRef: INVENTORY_OBSERVER,
    observedStateRef,
    observedAt,
    sourceEvidenceRef: evidenceRef,
    synthetic: true,
  };
}

interface StoredSealV1 {
  fingerprint: string;
  seal: EvidenceSealV1;
}

export class SyntheticObjectiveRiverSealServiceV1 {
  private readonly byReservation = new Map<string, StoredSealV1>();

  seal(input: {
    reservation: EvidenceReservationV1;
    effect: VerifiedEffectV1;
    sealedAt: string;
  }): EvidenceSealV1 {
    const { reservation, effect, sealedAt } = input;
    if (effect.reservationRef !== reservation.reservationRef) throw new Error("objective_seal_reservation_mismatch");
    if (effect.correlationId !== reservation.correlationId) throw new Error("objective_seal_correlation_mismatch");
    const verified = parseInstant(effect.verifiedAt, "objective_verified_time_invalid");
    const sealed = parseInstant(sealedAt, "objective_sealed_time_invalid");
    if (sealed < verified) throw new Error("objective_seal_before_verification");
    const fingerprint = digest(
      [reservation.reservationRef, effect.effectRef, effect.verificationRef, sealedAt].join("|"),
    );
    const existing = this.byReservation.get(reservation.reservationRef);
    if (existing) {
      if (existing.fingerprint !== fingerprint) throw new Error("objective_seal_idempotency_conflict");
      return { ...existing.seal };
    }
    const seal: EvidenceSealV1 = {
      sealRef: `OBJECTIVE-RIVER-SEAL:${fingerprint.slice(0, 24)}`,
      reservationRef: reservation.reservationRef,
      correlationId: reservation.correlationId,
      state: "SEALED",
      traceDigest: digest(
        [reservation.reservationRef, effect.effectRef, effect.verificationRef, effect.observedStateRef].join("|"),
      ),
      sealedAt,
    };
    this.byReservation.set(reservation.reservationRef, { fingerprint, seal });
    return { ...seal };
  }
}

export function recordInventoryObjectiveEffects(input: {
  objective: ObjectiveRefV1;
  bundle: ObjectiveProgramBundleV1;
  transfer: InventoryTransferSpecV1;
  verifiedEffect: VerifiedEffectV1;
  seal: EvidenceSealV1;
  observedAt: string;
}): readonly ObjectiveEffectV1[] {
  const { objective, bundle, transfer, verifiedEffect, seal, observedAt } = input;
  if (seal.state !== "SEALED" || seal.correlationId !== verifiedEffect.correlationId) {
    throw new Error("objective_effect_sealed_evidence_required");
  }
  if (verifiedEffect.programRef !== bundle.program.programRef) throw new Error("objective_effect_program_mismatch");
  const recordEvent = bundle.events.find((event) => event.eventType === "RECORD_EFFECTS");
  if (!recordEvent) throw new Error("objective_record_effect_event_missing");
  const base = `${objective.objectiveRef}|${bundle.program.programRef}|${verifiedEffect.effectRef}|${seal.sealRef}`;
  return [
    {
      effectRef: `OBJECTIVE-EFFECT:${digest(`${base}|source`).slice(0, 24)}`,
      objectiveRef: objective.objectiveRef,
      programRef: bundle.program.programRef,
      eventRef: recordEvent.eventRef,
      subjectRef: `${transfer.sourceLocationRef}:${transfer.skuRef}`,
      observedDeltaOrStateRef: `DELTA:-${transfer.quantity}`,
      evidenceRef: seal.sealRef,
      verifiedEffectRef: verifiedEffect.effectRef,
      classification: "intended",
      acceptanceRelevance: "REQUIRED",
      observedAt,
    },
    {
      effectRef: `OBJECTIVE-EFFECT:${digest(`${base}|destination`).slice(0, 24)}`,
      objectiveRef: objective.objectiveRef,
      programRef: bundle.program.programRef,
      eventRef: recordEvent.eventRef,
      subjectRef: `${transfer.destinationLocationRef}:${transfer.skuRef}`,
      observedDeltaOrStateRef: `DELTA:+${transfer.quantity}`,
      evidenceRef: seal.sealRef,
      verifiedEffectRef: verifiedEffect.effectRef,
      classification: "intended",
      acceptanceRelevance: "REQUIRED",
      observedAt,
    },
  ];
}

export function objectiveProjection(input: {
  objective: ObjectiveRefV1;
  bundle: ObjectiveProgramBundleV1;
  authority: ObjectiveAuthorityEnvelopeV1;
  effects: readonly ObjectiveEffectV1[];
  seal: EvidenceSealV1;
  sourceQuantity: number;
  destinationQuantity: number;
}): ObjectiveProjectionV1 {
  return {
    objectiveRef: input.objective.objectiveRef,
    status: input.objective.status,
    programRef: input.bundle.program.programRef,
    authorityRef: input.authority.authorityRef,
    effectRefs: input.effects.map((effect) => effect.effectRef),
    evidenceRefs: [input.seal.sealRef],
    sourceQuantity: input.sourceQuantity,
    destinationQuantity: input.destinationQuantity,
  };
}

export function evaluateInventoryTransferAcceptance(input: {
  objective: ObjectiveRefV1;
  transfer: InventoryTransferSpecV1;
  effects: readonly ObjectiveEffectV1[];
  seal: EvidenceSealV1;
  frontProjection: ObjectiveProjectionV1;
  backProjection: ObjectiveProjectionV1;
  checkedAt: string;
}): AcceptanceResultV1 {
  const reasons: string[] = [];
  const source = input.effects.find((effect) => effect.subjectRef === `${input.transfer.sourceLocationRef}:${input.transfer.skuRef}`);
  const destination = input.effects.find((effect) => effect.subjectRef === `${input.transfer.destinationLocationRef}:${input.transfer.skuRef}`);
  if (!source || source.observedDeltaOrStateRef !== `DELTA:-${input.transfer.quantity}`) reasons.push("SOURCE_EFFECT_MISSING_OR_WRONG");
  if (!destination || destination.observedDeltaOrStateRef !== `DELTA:+${input.transfer.quantity}`) reasons.push("DESTINATION_EFFECT_MISSING_OR_WRONG");
  if (input.seal.state !== "SEALED") reasons.push("SEALED_EVIDENCE_REQUIRED");
  if (input.effects.some((effect) => effect.evidenceRef !== input.seal.sealRef)) reasons.push("EFFECT_EVIDENCE_MISMATCH");
  if (new Set(input.effects.map((effect) => effect.effectRef)).size !== input.effects.length) reasons.push("DUPLICATE_EFFECT");
  if (JSON.stringify(input.frontProjection) !== JSON.stringify(input.backProjection)) reasons.push("PROJECTION_DIVERGENCE");
  if (input.effects.some((effect) => effect.objectiveRef !== input.objective.objectiveRef)) reasons.push("PURPOSE_LINEAGE_MISSING");

  return {
    objectiveRef: input.objective.objectiveRef,
    profileRef: input.objective.acceptanceProfileRef,
    result: reasons.length === 0 ? "PASS" : "FAIL",
    checkedEffectRefs: input.effects.map((effect) => effect.effectRef),
    checkedEvidenceRefs: [input.seal.sealRef],
    checkedAt: input.checkedAt,
    reasonCodes: reasons.length === 0 ? ["AUTHORIZED_OBSERVED_SEALED_EFFECTS_MATCH_OBJECTIVE"] : reasons,
  };
}

export interface SyntheticInventoryTransferTimelineV1 {
  compiledAt: string;
  actionRequestedAt: string;
  decidedAt: string;
  reservedAt: string;
  checkpointAt: string;
  executedAt: string;
  observedAt: string;
  verifiedAt: string;
  sealedAt: string;
  acceptedAt: string;
}

export function runSyntheticInventoryTransferProof(input: {
  objective: ObjectiveRefV1;
  authority: ObjectiveAuthorityEnvelopeV1;
  transfer: InventoryTransferSpecV1;
  sourceInitial: number;
  destinationInitial: number;
  timeline: SyntheticInventoryTransferTimelineV1;
}): InventoryTransferProofV1 {
  const { objective, authority, transfer, timeline } = input;
  const bundle = compileInventoryTransferObjective({ objective, authority, transfer, compiledAt: timeline.compiledAt });
  const dispatchEvent = bundle.events.find((event) => event.eventType === "DISPATCH");
  if (!dispatchEvent) throw new Error("objective_dispatch_event_missing");

  const ledger = new InMemoryInventoryLedgerV1();
  ledger.set(transfer.sourceLocationRef, transfer.skuRef, input.sourceInitial);
  ledger.set(transfer.destinationLocationRef, transfer.skuRef, input.destinationInitial);

  const request: WardenDecisionRequestV1 = {
    requestRef: `WARDEN-REQUEST:${digest(`${objective.objectiveRef}|${dispatchEvent.eventRef}`).slice(0, 24)}`,
    actorRef: authority.actorRef,
    representedPrincipalRef: authority.principalRef,
    actingCapacityRef: authority.actingCapacityRef,
    contextRef: authority.contextRef,
    programRef: bundle.program.programRef,
    eventRef: dispatchEvent.eventRef,
    action: TRANSFER_CAPABILITY,
    capabilityRef: TRANSFER_CAPABILITY,
    targetRef: targetRef(transfer),
    requestedEffect: objective.desiredStateRef,
    authorityRefs: [authority.authorityRef, authority.wardenDecisionRef],
    policyRefs: objective.authorityRequirementRefs,
    representationSourceRefs: [`REGISTRY:OBJECTIVE:${objective.objectiveRef}`, `REGISTRY:AUTHORITY:${authority.authorityRef}`],
    requestedAt: timeline.actionRequestedAt,
    correlationId: bundle.program.correlationId,
  };
  const policy: SyntheticWardenDecisionPolicyV1 = {
    policySnapshotRef: `WARDEN-POLICY-SNAPSHOT:${objective.objectiveRef}`,
    wardenRef: authority.wardenRef,
    lifecycle: "ACTIVE",
    validFrom: authority.validFrom,
    validUntil: authority.validUntil,
    actorRef: authority.actorRef,
    representedPrincipalRef: authority.principalRef,
    actingCapacityRef: authority.actingCapacityRef,
    contextRef: authority.contextRef,
    programRef: bundle.program.programRef,
    requiredAuthorityRefs: [authority.authorityRef, authority.wardenDecisionRef],
    requiredPolicyRefs: objective.authorityRequirementRefs,
    allowedCapabilityRefs: authority.allowedCapabilityRefs,
    manualReviewCapabilityRefs: [],
    constraints: authority.constraintRefs,
  };
  const decision = evaluateSyntheticWardenDecisionV1({ request, policy, decidedAt: timeline.decidedAt });
  if (decision.decision !== "ALLOW") throw new Error(`objective_action_not_allowed:${decision.decision}`);
  const action = buildAuthorizedActionEnvelopeV1(request, decision);
  const river = new SyntheticRiverReservationServiceV1();
  const reservation = river.reserve({ request, decision, action, reservedAt: timeline.reservedAt });
  const checkpoint: WardenExecutionCheckpointV1 = {
    checkpointRef: `WARDEN-EXEC-CHECK:${decision.decisionRef}`,
    decisionRef: decision.decisionRef,
    wardenRef: decision.wardenRef,
    correlationId: decision.correlationId,
    state: "VALID",
    checkedAt: timeline.checkpointAt,
    reasonCodes: ["objective_authority_active_for_execution"],
  };

  const adapter = new SyntheticInventoryTransferAdapterV1(ledger, transfer);
  const gate = new ControlledExecutionGateV1([adapter]);
  const receipt = gate.execute({ action, reservation, decision, checkpoint, executedAt: timeline.executedAt });
  const observation = observeInventoryTransfer({
    receipt,
    ledger,
    transfer,
    sourcePrior: input.sourceInitial,
    destinationPrior: input.destinationInitial,
    observedAt: timeline.observedAt,
  });
  const verification = new EffectVerificationServiceV1().verify({
    receipt,
    observation,
    verifiedAt: timeline.verifiedAt,
  });
  if (verification.state !== "VERIFIED_EFFECT") throw new Error(`objective_effect_verification_failed:${verification.reasonCode}`);

  const seal = new SyntheticObjectiveRiverSealServiceV1().seal({
    reservation,
    effect: verification.effect,
    sealedAt: timeline.sealedAt,
  });
  const effects = recordInventoryObjectiveEffects({
    objective,
    bundle,
    transfer,
    verifiedEffect: verification.effect,
    seal,
    observedAt: timeline.observedAt,
  });
  const acceptancePending = { ...objective, status: "ACCEPTANCE_PENDING" as const };
  const frontProjection = objectiveProjection({
    objective: acceptancePending,
    bundle,
    authority,
    effects,
    seal,
    sourceQuantity: ledger.get(transfer.sourceLocationRef, transfer.skuRef),
    destinationQuantity: ledger.get(transfer.destinationLocationRef, transfer.skuRef),
  });
  const backProjection = { ...frontProjection, effectRefs: [...frontProjection.effectRefs], evidenceRefs: [...frontProjection.evidenceRefs] };
  const acceptance = evaluateInventoryTransferAcceptance({
    objective: acceptancePending,
    transfer,
    effects,
    seal,
    frontProjection,
    backProjection,
    checkedAt: timeline.acceptedAt,
  });
  if (acceptance.result !== "PASS") throw new Error(`objective_acceptance_failed:${acceptance.reasonCodes.join(",")}`);

  return {
    objective,
    authority,
    bundle,
    verifiedEffectRef: verification.effect.effectRef,
    riverSealRef: seal.sealRef,
    effects,
    frontProjection,
    backProjection,
    acceptance,
    closedObjective: { ...objective, status: "CLOSED" },
  };
}
