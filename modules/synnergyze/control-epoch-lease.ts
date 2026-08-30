import { createHash } from "node:crypto";

import type {
  ContainmentControlPlaneV1,
  ContainmentEvaluationV1,
  ContainmentTransitionReceiptV1,
} from "./containment-control.ts";

export interface ContainmentEpochSourceV1 extends ContainmentControlPlaneV1 {
  transitionReceipts(): readonly ContainmentTransitionReceiptV1[];
}

export interface ControlLeaseIssueRequestV1 {
  targetRef: string;
  capabilityRef: string;
  programRef: string;
  domainRef?: string;
  authorityRef: string;
  issuedAt: string;
  expiresAt: string;
}

export interface ControlLeaseV1 extends ControlLeaseIssueRequestV1 {
  leaseRef: string;
  controlEpoch: number;
  containmentEvaluationRef: string;
  matchedControlRefs: readonly string[];
}

export interface ControlLeaseVerificationRequestV1 {
  leaseRef: string;
  targetRef: string;
  authorityRef: string;
  evaluatedAt: string;
}

export interface ControlLeaseVerificationV1 {
  leaseRef: string;
  controlEpoch: number;
  containmentEvaluationRef: string;
  evaluatedAt: string;
}

export interface ControlLeaseVerifierPortV1 {
  verifyLease(input: ControlLeaseVerificationRequestV1): ControlLeaseVerificationV1;
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

function cloneLease(lease: ControlLeaseV1): ControlLeaseV1 {
  return { ...lease, matchedControlRefs: [...lease.matchedControlRefs] };
}

function sameRefs(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const a = [...left].sort();
  const b = [...right].sort();
  return a.every((ref, index) => ref === b[index]);
}

export class ControlEpochLeaseServiceV1 implements ControlLeaseVerifierPortV1 {
  private readonly leases = new Map<string, ControlLeaseV1>();

  constructor(private readonly containment: ContainmentEpochSourceV1) {}

  currentEpoch(targetRef: string): number {
    requireText(targetRef, "control_epoch_target_required");
    return this.containment
      .transitionReceipts()
      .filter((receipt) => receipt.scope === "TARGET" && receipt.controlTargetId === targetRef)
      .length;
  }

  issueLease(input: ControlLeaseIssueRequestV1): ControlLeaseV1 {
    requireText(input.targetRef, "control_lease_target_required");
    requireText(input.capabilityRef, "control_lease_capability_required");
    requireText(input.programRef, "control_lease_program_required");
    requireText(input.authorityRef, "control_lease_authority_required");
    const issued = parseInstant(input.issuedAt, "control_lease_invalid_issue_time");
    const expires = parseInstant(input.expiresAt, "control_lease_invalid_expiry_time");
    if (expires <= issued) throw new Error("control_lease_invalid_validity_window");

    const evaluation = this.evaluateFor(input, input.issuedAt);
    if (evaluation.decision !== "ALLOW") throw new Error("control_lease_containment_denied");
    const controlEpoch = this.currentEpoch(input.targetRef);
    const normalized: ControlLeaseIssueRequestV1 = { ...input };
    const leaseRef = `WARDEN-CONTROL-LEASE:${digest(
      JSON.stringify({
        ...normalized,
        controlEpoch,
        containmentEvaluationRef: evaluation.evaluationRef,
        matchedControlRefs: [...evaluation.matchedControlRefs].sort(),
      }),
    ).slice(0, 24)}`;
    const lease: ControlLeaseV1 = {
      ...normalized,
      leaseRef,
      controlEpoch,
      containmentEvaluationRef: evaluation.evaluationRef,
      matchedControlRefs: [...evaluation.matchedControlRefs].sort(),
    };
    this.leases.set(leaseRef, lease);
    return cloneLease(lease);
  }

  verifyLease(input: ControlLeaseVerificationRequestV1): ControlLeaseVerificationV1 {
    const lease = this.leases.get(input.leaseRef);
    if (!lease) throw new Error("control_lease_not_found");
    if (lease.targetRef !== input.targetRef) throw new Error("control_lease_target_mismatch");
    if (lease.authorityRef !== input.authorityRef) throw new Error("control_lease_authority_mismatch");
    const evaluated = parseInstant(input.evaluatedAt, "control_lease_invalid_evaluation_time");
    const issued = parseInstant(lease.issuedAt, "control_lease_invalid_issue_time");
    const expires = parseInstant(lease.expiresAt, "control_lease_invalid_expiry_time");
    if (evaluated < issued) throw new Error("control_lease_not_yet_valid");
    if (evaluated > expires) throw new Error("control_lease_expired");

    const currentEpoch = this.currentEpoch(lease.targetRef);
    if (currentEpoch !== lease.controlEpoch) throw new Error("control_lease_epoch_stale");

    const evaluation = this.evaluateFor(lease, input.evaluatedAt);
    if (evaluation.decision !== "ALLOW") throw new Error("control_lease_containment_denied");
    if (!sameRefs(evaluation.matchedControlRefs, lease.matchedControlRefs)) {
      throw new Error("control_lease_control_set_stale");
    }
    return {
      leaseRef: lease.leaseRef,
      controlEpoch: lease.controlEpoch,
      containmentEvaluationRef: evaluation.evaluationRef,
      evaluatedAt: input.evaluatedAt,
    };
  }

  lease(leaseRef: string): ControlLeaseV1 | undefined {
    const lease = this.leases.get(leaseRef);
    return lease ? cloneLease(lease) : undefined;
  }

  private evaluateFor(
    input: Pick<ControlLeaseIssueRequestV1, "targetRef" | "capabilityRef" | "programRef" | "domainRef">,
    evaluatedAt: string,
  ): ContainmentEvaluationV1 {
    return this.containment.evaluate({
      targetRef: input.targetRef,
      capabilityRef: input.capabilityRef,
      programRef: input.programRef,
      domainRef: input.domainRef,
      evaluatedAt,
    });
  }
}
