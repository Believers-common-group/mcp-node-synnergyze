import { createHash } from "node:crypto";

import type { ContainmentStateV1 } from "./containment-control.ts";
import type {
  ContainmentContextEpochRequestV1,
  ContainmentHierarchyPortV1,
  ContainmentImpactScopeCompilerV1,
} from "./containment-hierarchy.ts";

export interface ContainmentAdmissionContextSourceV1 {
  currentContextEpoch(input: ContainmentContextEpochRequestV1): number;
}

export interface ContainmentAdmissionRequestV1 {
  targetRef: string;
  requestedState: ContainmentStateV1;
  capabilityRef: string;
  programRef: string;
  domainRef?: string;
  authorityRef: string;
  approvalRefs: readonly string[];
  admittedAt: string;
  expiresAt: string;
}

export interface ContainmentAdmissionEnvelopeV1 extends ContainmentAdmissionRequestV1 {
  envelopeRef: string;
  approvalRefs: readonly string[];
  hierarchySnapshotRef: string;
  impactCompilationRef: string;
  impactedNodeRefs: readonly string[];
  requiredApprovals: number;
  contextEpoch: number;
}

export interface ContainmentExecutionTokenV1 {
  tokenRef: string;
  envelopeRef: string;
  targetRef: string;
  requestedState: ContainmentStateV1;
  authorityRef: string;
  hierarchySnapshotRef: string;
  impactCompilationRef: string;
  contextEpoch: number;
  issuedAt: string;
  expiresAt: string;
  singleUse: true;
}

export interface ContainmentAdmissionResultV1 {
  envelope: ContainmentAdmissionEnvelopeV1;
  token: ContainmentExecutionTokenV1;
}

export interface ContainmentAdmissionVerificationRequestV1 {
  tokenRef: string;
  executionTargetRef: string;
  expectedStateRef: string;
  authorityRef: string;
  evaluatedAt: string;
}

export interface ContainmentAdmissionVerificationV1 {
  tokenRef: string;
  envelopeRef: string;
  contextEpoch: number;
  impactCompilationRef: string;
  evaluatedAt: string;
}

export interface ContainmentAdmissionVerifierPortV1 {
  verifyAndConsume(
    input: ContainmentAdmissionVerificationRequestV1,
  ): ContainmentAdmissionVerificationV1;
}

interface StoredAdmission {
  envelope: ContainmentAdmissionEnvelopeV1;
  token: ContainmentExecutionTokenV1;
  consumedAt?: string;
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function requireText(value: string, errorCode: string): void {
  if (!value.trim()) throw new Error(errorCode);
}

function parseInstant(value: string, errorCode: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(errorCode);
  return parsed;
}

function distinctRefs(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim()))].sort();
}

function sameRefs(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const a = [...left].sort();
  const b = [...right].sort();
  return a.every((ref, index) => ref === b[index]);
}

function hierarchySnapshotRef(
  hierarchy: ContainmentHierarchyPortV1,
  targetRef: string,
): string {
  const nodes = new Map<string, { nodeRef: string; kind: string; parentRef: string | null }>();
  for (const node of [
    ...hierarchy.ancestors(targetRef),
    ...hierarchy.descendants(targetRef),
  ]) {
    nodes.set(node.nodeRef, {
      nodeRef: node.nodeRef,
      kind: node.kind,
      parentRef: node.parentRef ?? null,
    });
  }
  const snapshot = [...nodes.values()].sort((a, b) => a.nodeRef.localeCompare(b.nodeRef));
  return `WARDEN-CONTAINMENT-HIERARCHY-SNAPSHOT:${digest(JSON.stringify(snapshot)).slice(0, 24)}`;
}

function cloneEnvelope(envelope: ContainmentAdmissionEnvelopeV1): ContainmentAdmissionEnvelopeV1 {
  return {
    ...envelope,
    approvalRefs: [...envelope.approvalRefs],
    impactedNodeRefs: [...envelope.impactedNodeRefs],
  };
}

function cloneToken(token: ContainmentExecutionTokenV1): ContainmentExecutionTokenV1 {
  return { ...token };
}

export class ContainmentAdmissionServiceV1 implements ContainmentAdmissionVerifierPortV1 {
  private readonly admissions = new Map<string, StoredAdmission>();

  constructor(
    private readonly context: ContainmentAdmissionContextSourceV1,
    private readonly hierarchy: ContainmentHierarchyPortV1,
    private readonly impact: ContainmentImpactScopeCompilerV1,
  ) {}

  admit(input: ContainmentAdmissionRequestV1): ContainmentAdmissionResultV1 {
    requireText(input.targetRef, "containment_admission_target_required");
    requireText(input.capabilityRef, "containment_admission_capability_required");
    requireText(input.programRef, "containment_admission_program_required");
    requireText(input.authorityRef, "containment_admission_authority_required");
    const admitted = parseInstant(input.admittedAt, "containment_admission_invalid_time");
    const expires = parseInstant(input.expiresAt, "containment_admission_invalid_expiry_time");
    if (expires <= admitted) throw new Error("containment_admission_invalid_validity_window");

    const approvalRefs = distinctRefs(input.approvalRefs);
    const compilation = this.impact.compile({
      targetRef: input.targetRef,
      requestedState: input.requestedState,
      approvalRefs,
    });
    if (compilation.decision !== "ADMISSIBLE") {
      throw new Error("containment_admission_quorum_required");
    }

    const contextEpoch = this.context.currentContextEpoch({
      targetRef: input.targetRef,
      capabilityRef: input.capabilityRef,
      programRef: input.programRef,
      domainRef: input.domainRef,
    });
    const snapshotRef = hierarchySnapshotRef(this.hierarchy, input.targetRef);
    const normalized: ContainmentAdmissionRequestV1 = {
      ...input,
      approvalRefs,
    };
    const envelopeRef = `WARDEN-CONTAINMENT-ADMISSION:${digest(
      JSON.stringify({
        ...normalized,
        hierarchySnapshotRef: snapshotRef,
        impactCompilationRef: compilation.compilationRef,
        impactedNodeRefs: [...compilation.impactedNodeRefs].sort(),
        requiredApprovals: compilation.requiredApprovals,
        contextEpoch,
      }),
    ).slice(0, 24)}`;
    const envelope: ContainmentAdmissionEnvelopeV1 = {
      ...normalized,
      envelopeRef,
      approvalRefs,
      hierarchySnapshotRef: snapshotRef,
      impactCompilationRef: compilation.compilationRef,
      impactedNodeRefs: [...compilation.impactedNodeRefs].sort(),
      requiredApprovals: compilation.requiredApprovals,
      contextEpoch,
    };
    const tokenRef = `WARDEN-CONTAINMENT-TOKEN:${digest(
      JSON.stringify({
        envelopeRef,
        targetRef: input.targetRef,
        requestedState: input.requestedState,
        authorityRef: input.authorityRef,
        hierarchySnapshotRef: snapshotRef,
        impactCompilationRef: compilation.compilationRef,
        contextEpoch,
        issuedAt: input.admittedAt,
        expiresAt: input.expiresAt,
      }),
    ).slice(0, 24)}`;
    const token: ContainmentExecutionTokenV1 = {
      tokenRef,
      envelopeRef,
      targetRef: input.targetRef,
      requestedState: input.requestedState,
      authorityRef: input.authorityRef,
      hierarchySnapshotRef: snapshotRef,
      impactCompilationRef: compilation.compilationRef,
      contextEpoch,
      issuedAt: input.admittedAt,
      expiresAt: input.expiresAt,
      singleUse: true,
    };
    this.admissions.set(tokenRef, { envelope, token });
    return { envelope: cloneEnvelope(envelope), token: cloneToken(token) };
  }

  verifyAndConsume(
    input: ContainmentAdmissionVerificationRequestV1,
  ): ContainmentAdmissionVerificationV1 {
    const stored = this.admissions.get(input.tokenRef);
    if (!stored) throw new Error("containment_admission_token_not_found");
    if (stored.consumedAt) throw new Error("containment_admission_token_consumed");
    const { envelope, token } = stored;
    if (input.authorityRef !== token.authorityRef) {
      throw new Error("containment_admission_authority_mismatch");
    }
    if (!envelope.impactedNodeRefs.includes(input.executionTargetRef)) {
      throw new Error("containment_admission_target_not_covered");
    }
    if (input.expectedStateRef !== token.requestedState) {
      throw new Error("containment_admission_state_mismatch");
    }

    const evaluated = parseInstant(input.evaluatedAt, "containment_admission_invalid_evaluation_time");
    const issued = parseInstant(token.issuedAt, "containment_admission_invalid_time");
    const expires = parseInstant(token.expiresAt, "containment_admission_invalid_expiry_time");
    if (evaluated < issued) throw new Error("containment_admission_token_not_yet_valid");
    if (evaluated > expires) throw new Error("containment_admission_token_expired");

    const contextEpoch = this.context.currentContextEpoch({
      targetRef: envelope.targetRef,
      capabilityRef: envelope.capabilityRef,
      programRef: envelope.programRef,
      domainRef: envelope.domainRef,
    });
    if (contextEpoch !== envelope.contextEpoch) {
      throw new Error("containment_admission_context_stale");
    }

    const snapshotRef = hierarchySnapshotRef(this.hierarchy, envelope.targetRef);
    if (snapshotRef !== envelope.hierarchySnapshotRef) {
      throw new Error("containment_admission_hierarchy_stale");
    }

    const compilation = this.impact.compile({
      targetRef: envelope.targetRef,
      requestedState: envelope.requestedState,
      approvalRefs: envelope.approvalRefs,
    });
    if (
      compilation.decision !== "ADMISSIBLE" ||
      compilation.compilationRef !== envelope.impactCompilationRef ||
      compilation.requiredApprovals !== envelope.requiredApprovals ||
      !sameRefs(compilation.impactedNodeRefs, envelope.impactedNodeRefs)
    ) {
      throw new Error("containment_admission_impact_stale");
    }

    stored.consumedAt = input.evaluatedAt;
    return {
      tokenRef: token.tokenRef,
      envelopeRef: envelope.envelopeRef,
      contextEpoch: envelope.contextEpoch,
      impactCompilationRef: envelope.impactCompilationRef,
      evaluatedAt: input.evaluatedAt,
    };
  }

  envelope(envelopeRef: string): ContainmentAdmissionEnvelopeV1 | undefined {
    for (const { envelope } of this.admissions.values()) {
      if (envelope.envelopeRef === envelopeRef) return cloneEnvelope(envelope);
    }
    return undefined;
  }

  token(tokenRef: string): ContainmentExecutionTokenV1 | undefined {
    const stored = this.admissions.get(tokenRef);
    return stored ? cloneToken(stored.token) : undefined;
  }
}
