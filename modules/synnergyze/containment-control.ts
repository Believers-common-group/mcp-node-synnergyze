import { createHash } from "node:crypto";

export type ContainmentStateV1 =
  | "ACTIVE"
  | "RESTRICTED"
  | "PAUSED"
  | "ISOLATED"
  | "DISABLED";

export type ContainmentScopeV1 = "TARGET" | "CAPABILITY" | "PROGRAM" | "DOMAIN";

export interface ContainmentControlRecordV1 {
  controlTargetId: string;
  scope: ContainmentScopeV1;
  state: ContainmentStateV1;
  reason: string;
  authorityRef: string;
  effectiveAt: string;
  expiresAt?: string;
  allowedCapabilityRefs?: readonly string[];
  recoveryEvidenceRefs?: readonly string[];
}

export interface ContainmentTransitionReceiptV1 extends ContainmentControlRecordV1 {
  transitionRef: string;
  previousState: ContainmentStateV1;
  nextState: ContainmentStateV1;
  recordedAt: string;
}

export interface ContainmentEvaluationRequestV1 {
  targetRef: string;
  capabilityRef: string;
  programRef: string;
  domainRef?: string;
  evaluatedAt: string;
}

export interface ContainmentEvaluationV1 {
  evaluationRef: string;
  state: ContainmentStateV1;
  decision: "ALLOW" | "DENY";
  matchedControlRefs: readonly string[];
  reasonCodes: readonly string[];
  evaluatedAt: string;
}

export interface ContainmentMaintenanceSnapshotV1 {
  activeControlCount: number;
  evaluationCount: number;
  deniedEvaluationCount: number;
  states: Partial<Record<ContainmentStateV1, number>>;
}

export interface ContainmentControlPlaneV1 {
  evaluate(input: ContainmentEvaluationRequestV1): ContainmentEvaluationV1;
  maintenanceSnapshot(evaluatedAt: string): ContainmentMaintenanceSnapshotV1;
}

interface StoredControl {
  record: ContainmentControlRecordV1;
  transitionRef: string;
}

const SEVERITY: Readonly<Record<ContainmentStateV1, number>> = {
  ACTIVE: 0,
  RESTRICTED: 1,
  PAUSED: 2,
  ISOLATED: 3,
  DISABLED: 4,
};

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function parseInstant(value: string, code: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(code);
  return parsed;
}

function key(scope: ContainmentScopeV1, controlTargetId: string): string {
  return `${scope}:${controlTargetId}`;
}

function isEffective(record: ContainmentControlRecordV1, evaluatedAt: string): boolean {
  const evaluated = parseInstant(evaluatedAt, "containment_invalid_evaluation_time");
  const effective = parseInstant(record.effectiveAt, "containment_invalid_effective_time");
  if (evaluated < effective) return false;
  if (!record.expiresAt) return true;
  const expires = parseInstant(record.expiresAt, "containment_invalid_expiry_time");
  if (expires < effective) throw new Error("containment_invalid_validity_window");
  return evaluated <= expires;
}

function matches(
  record: ContainmentControlRecordV1,
  input: ContainmentEvaluationRequestV1,
): boolean {
  switch (record.scope) {
    case "TARGET":
      return record.controlTargetId === input.targetRef;
    case "CAPABILITY":
      return record.controlTargetId === input.capabilityRef;
    case "PROGRAM":
      return record.controlTargetId === input.programRef;
    case "DOMAIN":
      return record.controlTargetId === (input.domainRef ?? "VSR");
  }
}

function cloneRecord(record: ContainmentControlRecordV1): ContainmentControlRecordV1 {
  return {
    ...record,
    allowedCapabilityRefs: record.allowedCapabilityRefs
      ? [...record.allowedCapabilityRefs]
      : undefined,
    recoveryEvidenceRefs: record.recoveryEvidenceRefs
      ? [...record.recoveryEvidenceRefs]
      : undefined,
  };
}

export class InMemoryContainmentControlPlaneV1 implements ContainmentControlPlaneV1 {
  private readonly current = new Map<string, StoredControl>();
  private readonly transitions: ContainmentTransitionReceiptV1[] = [];
  private readonly evaluationLog: ContainmentEvaluationV1[] = [];

  transition(record: ContainmentControlRecordV1): ContainmentTransitionReceiptV1 {
    if (!record.controlTargetId.trim()) throw new Error("containment_target_required");
    if (!record.reason.trim()) throw new Error("containment_reason_required");
    if (!record.authorityRef.trim()) throw new Error("containment_authority_required");
    parseInstant(record.effectiveAt, "containment_invalid_effective_time");
    if (record.expiresAt) {
      const effective = parseInstant(record.effectiveAt, "containment_invalid_effective_time");
      const expires = parseInstant(record.expiresAt, "containment_invalid_expiry_time");
      if (expires < effective) throw new Error("containment_invalid_validity_window");
    }

    const controlKey = key(record.scope, record.controlTargetId);
    const previous = this.current.get(controlKey)?.record;
    const previousState = previous?.state ?? "ACTIVE";
    if (
      record.state === "ACTIVE" &&
      previousState !== "ACTIVE" &&
      !record.recoveryEvidenceRefs?.length
    ) {
      throw new Error("containment_recovery_evidence_required");
    }
    if (record.state === "RESTRICTED" && !record.allowedCapabilityRefs?.length) {
      throw new Error("containment_restricted_allowlist_required");
    }

    const normalized = cloneRecord(record);
    const transitionRef = `WARDEN-CONTAINMENT-TRANSITION:${digest(
      JSON.stringify({ ...normalized, previousState }),
    ).slice(0, 24)}`;
    const receipt: ContainmentTransitionReceiptV1 = {
      ...normalized,
      transitionRef,
      previousState,
      nextState: normalized.state,
      recordedAt: normalized.effectiveAt,
    };

    this.current.set(controlKey, { record: normalized, transitionRef });
    this.transitions.push(receipt);
    return { ...receipt };
  }

  evaluate(input: ContainmentEvaluationRequestV1): ContainmentEvaluationV1 {
    parseInstant(input.evaluatedAt, "containment_invalid_evaluation_time");

    const matched = [...this.current.values()].filter(
      ({ record }) => matches(record, input) && isEffective(record, input.evaluatedAt),
    );
    const mostRestrictive = matched.reduce<ContainmentStateV1>(
      (state, control) =>
        SEVERITY[control.record.state] > SEVERITY[state] ? control.record.state : state,
      "ACTIVE",
    );

    const restricted = matched.filter(({ record }) => record.state === "RESTRICTED");
    const restrictedAllows = restricted.every(({ record }) =>
      record.allowedCapabilityRefs?.includes(input.capabilityRef),
    );
    const hardDeny = ["PAUSED", "ISOLATED", "DISABLED"].includes(mostRestrictive);
    const decision = hardDeny || (mostRestrictive === "RESTRICTED" && !restrictedAllows)
      ? "DENY"
      : "ALLOW";

    const reasonCodes = new Set<string>();
    if (hardDeny) reasonCodes.add(`containment_${mostRestrictive.toLowerCase()}`);
    if (mostRestrictive === "RESTRICTED") {
      reasonCodes.add(
        restrictedAllows ? "containment_restricted_capability_allowed" : "containment_restricted",
      );
    }
    if (matched.length === 0) reasonCodes.add("containment_active_default");

    const matchedControlRefs = matched.map(({ transitionRef }) => transitionRef).sort();
    const evaluationRef = `WARDEN-CONTAINMENT-EVAL:${digest(
      JSON.stringify({
        targetRef: input.targetRef,
        capabilityRef: input.capabilityRef,
        programRef: input.programRef,
        domainRef: input.domainRef ?? "VSR",
        evaluatedAt: input.evaluatedAt,
        matchedControlRefs,
        state: mostRestrictive,
        decision,
      }),
    ).slice(0, 24)}`;
    const evaluation: ContainmentEvaluationV1 = {
      evaluationRef,
      state: mostRestrictive,
      decision,
      matchedControlRefs,
      reasonCodes: [...reasonCodes],
      evaluatedAt: input.evaluatedAt,
    };
    this.evaluationLog.push(evaluation);
    return { ...evaluation, matchedControlRefs: [...matchedControlRefs], reasonCodes: [...reasonCodes] };
  }

  maintenanceSnapshot(evaluatedAt: string): ContainmentMaintenanceSnapshotV1 {
    const active = [...this.current.values()].filter(({ record }) => isEffective(record, evaluatedAt));
    const states: Partial<Record<ContainmentStateV1, number>> = {};
    for (const { record } of active) states[record.state] = (states[record.state] ?? 0) + 1;
    return {
      activeControlCount: active.length,
      evaluationCount: this.evaluationLog.length,
      deniedEvaluationCount: this.evaluationLog.filter(({ decision }) => decision === "DENY").length,
      states,
    };
  }

  transitionReceipts(): readonly ContainmentTransitionReceiptV1[] {
    return this.transitions.map((receipt) => ({ ...receipt }));
  }

  evaluations(): readonly ContainmentEvaluationV1[] {
    return this.evaluationLog.map((evaluation) => ({
      ...evaluation,
      matchedControlRefs: [...evaluation.matchedControlRefs],
      reasonCodes: [...evaluation.reasonCodes],
    }));
  }
}
