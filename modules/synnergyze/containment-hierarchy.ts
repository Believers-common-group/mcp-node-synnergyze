import { createHash } from "node:crypto";

import type {
  ContainmentControlPlaneV1,
  ContainmentEvaluationRequestV1,
  ContainmentEvaluationV1,
  ContainmentMaintenanceSnapshotV1,
  ContainmentStateV1,
  ContainmentTransitionReceiptV1,
} from "./containment-control.ts";

export type ContainmentHierarchyKindV1 =
  | "CAPABILITY"
  | "INSTANCE"
  | "DEVICE"
  | "APPLICATION"
  | "WARDEN_CELL"
  | "LOCATION"
  | "PROGRAMME"
  | "TENANT"
  | "REGION"
  | "FEDERATION";

export interface ContainmentHierarchyNodeV1 {
  nodeRef: string;
  kind: ContainmentHierarchyKindV1;
  parentRef?: string;
}

export interface ContainmentHierarchyPortV1 {
  node(nodeRef: string): ContainmentHierarchyNodeV1 | undefined;
  ancestors(nodeRef: string): readonly ContainmentHierarchyNodeV1[];
  descendants(nodeRef: string): readonly ContainmentHierarchyNodeV1[];
}

export interface HierarchicalContainmentSourceV1 extends ContainmentControlPlaneV1 {
  transitionReceipts(): readonly ContainmentTransitionReceiptV1[];
}

export interface ContainmentContextEpochRequestV1 {
  targetRef: string;
  capabilityRef: string;
  programRef: string;
  domainRef?: string;
}

export interface ContainmentImpactCompileRequestV1 {
  targetRef: string;
  requestedState: ContainmentStateV1;
  approvalRefs: readonly string[];
}

export interface ContainmentImpactCompilationV1 {
  compilationRef: string;
  targetRef: string;
  targetKind: ContainmentHierarchyKindV1;
  requestedState: ContainmentStateV1;
  impactedNodeRefs: readonly string[];
  impactCount: number;
  requiredApprovals: number;
  distinctApprovalCount: number;
  decision: "ADMISSIBLE" | "QUORUM_REQUIRED";
}

export type ContainmentQuorumPolicyV1 = Partial<
  Readonly<Record<ContainmentHierarchyKindV1, number>>
>;

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

function requireText(value: string, errorCode: string): void {
  if (!value.trim()) throw new Error(errorCode);
}

function parseInstant(value: string, errorCode: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(errorCode);
  return parsed;
}

function isEffective(receipt: ContainmentTransitionReceiptV1, evaluatedAt: string): boolean {
  const evaluated = parseInstant(evaluatedAt, "containment_invalid_evaluation_time");
  const effective = parseInstant(receipt.effectiveAt, "containment_invalid_effective_time");
  if (evaluated < effective) return false;
  if (!receipt.expiresAt) return true;
  const expires = parseInstant(receipt.expiresAt, "containment_invalid_expiry_time");
  if (expires < effective) throw new Error("containment_invalid_validity_window");
  return evaluated <= expires;
}

function cloneNode(node: ContainmentHierarchyNodeV1): ContainmentHierarchyNodeV1 {
  return { ...node };
}

export class InMemoryContainmentHierarchyV1 implements ContainmentHierarchyPortV1 {
  private readonly nodes = new Map<string, ContainmentHierarchyNodeV1>();
  private readonly children = new Map<string, string[]>();

  constructor(nodes: readonly ContainmentHierarchyNodeV1[]) {
    for (const input of nodes) {
      requireText(input.nodeRef, "containment_hierarchy_node_required");
      if (this.nodes.has(input.nodeRef)) throw new Error("containment_hierarchy_duplicate_node");
      this.nodes.set(input.nodeRef, cloneNode(input));
    }
    for (const node of this.nodes.values()) {
      if (!node.parentRef) continue;
      if (!this.nodes.has(node.parentRef)) throw new Error("containment_hierarchy_parent_not_found");
      if (node.parentRef === node.nodeRef) throw new Error("containment_hierarchy_cycle");
      const children = this.children.get(node.parentRef) ?? [];
      children.push(node.nodeRef);
      this.children.set(node.parentRef, children);
    }
    for (const node of this.nodes.values()) this.assertAcyclic(node.nodeRef);
  }

  node(nodeRef: string): ContainmentHierarchyNodeV1 | undefined {
    const node = this.nodes.get(nodeRef);
    return node ? cloneNode(node) : undefined;
  }

  ancestors(nodeRef: string): readonly ContainmentHierarchyNodeV1[] {
    const start = this.nodes.get(nodeRef);
    if (!start) throw new Error("containment_hierarchy_node_not_found");
    const result: ContainmentHierarchyNodeV1[] = [];
    let current: ContainmentHierarchyNodeV1 | undefined = start;
    while (current) {
      result.push(cloneNode(current));
      current = current.parentRef ? this.nodes.get(current.parentRef) : undefined;
    }
    return result;
  }

  descendants(nodeRef: string): readonly ContainmentHierarchyNodeV1[] {
    if (!this.nodes.has(nodeRef)) throw new Error("containment_hierarchy_node_not_found");
    const result: ContainmentHierarchyNodeV1[] = [];
    const queue = [nodeRef];
    while (queue.length) {
      const next = queue.shift()!;
      const node = this.nodes.get(next)!;
      result.push(cloneNode(node));
      queue.push(...(this.children.get(next) ?? []));
    }
    return result;
  }

  private assertAcyclic(nodeRef: string): void {
    const seen = new Set<string>();
    let current: ContainmentHierarchyNodeV1 | undefined = this.nodes.get(nodeRef);
    while (current) {
      if (seen.has(current.nodeRef)) throw new Error("containment_hierarchy_cycle");
      seen.add(current.nodeRef);
      current = current.parentRef ? this.nodes.get(current.parentRef) : undefined;
    }
  }
}

export class HierarchicalContainmentControlPlaneV1 implements HierarchicalContainmentSourceV1 {
  constructor(
    private readonly base: HierarchicalContainmentSourceV1,
    private readonly hierarchy: ContainmentHierarchyPortV1,
  ) {}

  evaluate(input: ContainmentEvaluationRequestV1): ContainmentEvaluationV1 {
    const direct = this.base.evaluate(input);
    const ancestorRefs = new Set(
      this.hierarchy
        .ancestors(input.targetRef)
        .slice(1)
        .map((node) => node.nodeRef),
    );
    const latestByTarget = new Map<string, ContainmentTransitionReceiptV1>();
    for (const receipt of this.base.transitionReceipts()) {
      if (receipt.scope === "TARGET" && ancestorRefs.has(receipt.controlTargetId)) {
        latestByTarget.set(receipt.controlTargetId, receipt);
      }
    }
    const inherited = [...latestByTarget.values()].filter((receipt) =>
      isEffective(receipt, input.evaluatedAt),
    );
    if (!inherited.length) return direct;

    const inheritedState = inherited.reduce<ContainmentStateV1>(
      (state, receipt) => (SEVERITY[receipt.state] > SEVERITY[state] ? receipt.state : state),
      "ACTIVE",
    );
    const state = SEVERITY[inheritedState] > SEVERITY[direct.state] ? inheritedState : direct.state;
    const inheritedRestricted = inherited.filter((receipt) => receipt.state === "RESTRICTED");
    const inheritedRestrictedAllows = inheritedRestricted.every((receipt) =>
      receipt.allowedCapabilityRefs?.includes(input.capabilityRef),
    );
    const inheritedHardDeny = inherited.some((receipt) =>
      ["PAUSED", "ISOLATED", "DISABLED"].includes(receipt.state),
    );
    const decision =
      direct.decision === "DENY" || inheritedHardDeny || !inheritedRestrictedAllows
        ? "DENY"
        : "ALLOW";
    const matchedControlRefs = [
      ...direct.matchedControlRefs,
      ...inherited.map((receipt) => receipt.transitionRef),
    ].sort();
    const reasonCodes = new Set(direct.reasonCodes);
    reasonCodes.add("containment_inherited_ancestor");
    if (inheritedHardDeny) reasonCodes.add(`containment_${state.toLowerCase()}`);
    if (inheritedRestricted.length) {
      reasonCodes.add(
        inheritedRestrictedAllows
          ? "containment_restricted_capability_allowed"
          : "containment_restricted",
      );
    }
    const evaluationRef = `WARDEN-CONTAINMENT-HIERARCHY-EVAL:${digest(
      JSON.stringify({
        directEvaluationRef: direct.evaluationRef,
        targetRef: input.targetRef,
        capabilityRef: input.capabilityRef,
        programRef: input.programRef,
        domainRef: input.domainRef ?? "VSR",
        evaluatedAt: input.evaluatedAt,
        matchedControlRefs,
        state,
        decision,
      }),
    ).slice(0, 24)}`;
    return {
      evaluationRef,
      state,
      decision,
      matchedControlRefs,
      reasonCodes: [...reasonCodes],
      evaluatedAt: input.evaluatedAt,
    };
  }

  maintenanceSnapshot(evaluatedAt: string): ContainmentMaintenanceSnapshotV1 {
    return this.base.maintenanceSnapshot(evaluatedAt);
  }

  transitionReceipts(): readonly ContainmentTransitionReceiptV1[] {
    return this.base.transitionReceipts();
  }

  currentContextEpoch(input: ContainmentContextEpochRequestV1): number {
    const targetRefs = new Set(this.hierarchy.ancestors(input.targetRef).map((node) => node.nodeRef));
    const domainRef = input.domainRef ?? "VSR";
    return this.base.transitionReceipts().filter((receipt) => {
      switch (receipt.scope) {
        case "TARGET":
          return targetRefs.has(receipt.controlTargetId);
        case "CAPABILITY":
          return receipt.controlTargetId === input.capabilityRef;
        case "PROGRAM":
          return receipt.controlTargetId === input.programRef;
        case "DOMAIN":
          return receipt.controlTargetId === domainRef;
      }
    }).length;
  }
}

export class ContainmentImpactScopeCompilerV1 {
  private readonly quorum: ContainmentQuorumPolicyV1;

  constructor(
    private readonly hierarchy: ContainmentHierarchyPortV1,
    quorum: ContainmentQuorumPolicyV1 = {},
  ) {
    for (const required of Object.values(quorum)) {
      if (!Number.isInteger(required) || required! < 1) {
        throw new Error("containment_quorum_invalid_requirement");
      }
    }
    this.quorum = { ...quorum };
  }

  compile(input: ContainmentImpactCompileRequestV1): ContainmentImpactCompilationV1 {
    const target = this.hierarchy.node(input.targetRef);
    if (!target) throw new Error("containment_hierarchy_node_not_found");
    const impactedNodeRefs = this.hierarchy.descendants(input.targetRef).map((node) => node.nodeRef);
    const distinctApprovalRefs = [...new Set(input.approvalRefs.filter((ref) => ref.trim()))].sort();
    const requiredApprovals = this.quorum[target.kind] ?? 1;
    const decision =
      distinctApprovalRefs.length >= requiredApprovals ? "ADMISSIBLE" : "QUORUM_REQUIRED";
    const compilationRef = `WARDEN-CONTAINMENT-IMPACT:${digest(
      JSON.stringify({
        targetRef: input.targetRef,
        targetKind: target.kind,
        requestedState: input.requestedState,
        impactedNodeRefs,
        requiredApprovals,
        approvalRefs: distinctApprovalRefs,
        decision,
      }),
    ).slice(0, 24)}`;
    return {
      compilationRef,
      targetRef: input.targetRef,
      targetKind: target.kind,
      requestedState: input.requestedState,
      impactedNodeRefs,
      impactCount: impactedNodeRefs.length,
      requiredApprovals,
      distinctApprovalCount: distinctApprovalRefs.length,
      decision,
    };
  }
}
