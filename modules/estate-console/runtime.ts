import { createHash } from "node:crypto";

import type { WardenDecisionRequestV1, WardenDecisionV1 } from "../warden/contracts.ts";
import type {
  EstateArtifactV1,
  EstateConsoleSessionV1,
  EstateReceiptProjectionV1,
} from "./contracts.ts";
import type { ConsoleReceiptPortV1 } from "./receipt-adapter.ts";

export interface EstateArtifactSubmissionPortV1 {
  verifyForSubmission(artifact: EstateArtifactV1): EstateArtifactV1;
}

export interface EstateConsoleWardenPortV1 {
  evaluate(request: WardenDecisionRequestV1): WardenDecisionV1;
}

export interface EstateConsoleAuthorityContextV1 {
  readonly representedPrincipalRef: string;
  readonly actingCapacityRef: string;
  readonly contextRef: string;
  readonly programRef: string;
  readonly authorityRefs: readonly string[];
  readonly policyRefs: readonly string[];
  readonly representationSourceRefs: readonly string[];
}

export interface EstateConsoleRuntimeDependenciesV1 {
  readonly session: EstateConsoleSessionV1;
  readonly artifacts: EstateArtifactSubmissionPortV1;
  readonly receipts: ConsoleReceiptPortV1;
  readonly warden: EstateConsoleWardenPortV1;
  readonly authorityContext: EstateConsoleAuthorityContextV1;
}

export interface EstateConsoleSubmissionResultV1 {
  readonly artifact: EstateArtifactV1;
  readonly receipt: EstateReceiptProjectionV1;
  readonly wardenDecision: WardenDecisionV1;
  readonly executed: false;
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function withState(artifact: EstateArtifactV1, state: EstateArtifactV1["state"]): EstateArtifactV1 {
  return { ...artifact, state, sourceRefs: [...artifact.sourceRefs] };
}

export class EstateConsoleRuntimeV1 {
  constructor(private readonly deps: EstateConsoleRuntimeDependenciesV1) {}

  dependencies(): EstateConsoleRuntimeDependenciesV1 {
    return this.deps;
  }

  submit(artifact: EstateArtifactV1, requestedAt: string): EstateConsoleSubmissionResultV1 {
    this.assertSubmitContext(artifact);
    const verified = this.deps.artifacts.verifyForSubmission(artifact);

    let reserved: EstateReceiptProjectionV1;
    try {
      reserved = this.deps.receipts.reserve({
        sessionRef: this.deps.session.sessionRef,
        correlationId: verified.correlationId,
        actionClass: "PROPOSE",
        payloadDigest: verified.sha256,
        reservedAt: requestedAt,
      });
    } catch {
      throw new Error("estate_console_river_unavailable");
    }

    const request = this.buildWardenRequest(verified, requestedAt);
    let decision: WardenDecisionV1;
    try {
      decision = this.deps.warden.evaluate(request);
    } catch {
      try {
        this.deps.receipts.recordRejected({
          receiptRef: reserved.receiptRef,
          recordedAt: requestedAt,
          reasonCodes: ["warden_unavailable"],
        });
      } catch {
        throw new Error("estate_console_river_unavailable");
      }
      throw new Error("estate_console_warden_unavailable");
    }

    if (
      decision.requestRef !== request.requestRef ||
      decision.action !== request.action ||
      decision.targetRef !== request.targetRef ||
      decision.correlationId !== request.correlationId
    ) {
      this.deps.receipts.recordRejected({
        receiptRef: reserved.receiptRef,
        recordedAt: decision.decidedAt,
        reasonCodes: ["warden_decision_context_mismatch"],
      });
      throw new Error("estate_console_warden_decision_context_mismatch");
    }

    if (decision.decision === "ALLOW") {
      const receipt = this.deps.receipts.recordAuthorizedProposal({
        receiptRef: reserved.receiptRef,
        wardenDecisionRef: decision.decisionRef,
        recordedAt: decision.decidedAt,
        reasonCodes: decision.reasonCodes,
      });
      return {
        artifact: withState(verified, "AUTHORIZED_PROPOSAL"),
        receipt,
        wardenDecision: decision,
        executed: false,
      };
    }

    if (decision.decision === "DENY") {
      const receipt = this.deps.receipts.recordDeniedProposal({
        receiptRef: reserved.receiptRef,
        wardenDecisionRef: decision.decisionRef,
        recordedAt: decision.decidedAt,
        reasonCodes: decision.reasonCodes,
      });
      return {
        artifact: withState(verified, "DENIED"),
        receipt,
        wardenDecision: decision,
        executed: false,
      };
    }

    const receipt = this.deps.receipts.recordHeldProposal({
      receiptRef: reserved.receiptRef,
      wardenDecisionRef: decision.decisionRef,
      recordedAt: decision.decidedAt,
      reasonCodes: decision.reasonCodes,
    });
    return {
      artifact: withState(verified, "HELD_FOR_REVIEW"),
      receipt,
      wardenDecision: decision,
      executed: false,
    };
  }

  private assertSubmitContext(artifact: EstateArtifactV1): void {
    const { session } = this.deps;
    if (session.state !== "ACTIVE") throw new Error("estate_console_active_session_required");
    if (!session.capabilities.includes("SUBMIT")) {
      throw new Error("estate_console_submit_capability_required");
    }
    if (
      artifact.sessionRef !== session.sessionRef ||
      artifact.principalRef !== session.principalRef ||
      artifact.deviceRef !== session.deviceRef ||
      artifact.consoleRef !== session.consoleRef
    ) {
      throw new Error("estate_console_artifact_session_mismatch");
    }
    if (artifact.state !== "REGISTERED") {
      throw new Error("estate_console_registered_artifact_required");
    }
  }

  private buildWardenRequest(
    artifact: EstateArtifactV1,
    requestedAt: string,
  ): WardenDecisionRequestV1 {
    const { session, authorityContext } = this.deps;
    const requestRef = `ESTATE-CONSOLE-WARDEN-REQUEST:${digest(
      JSON.stringify({
        sessionRef: session.sessionRef,
        artifactRef: artifact.artifactRef,
        requestedAt,
        correlationId: artifact.correlationId,
      }),
    ).slice(0, 24)}`;

    return {
      requestRef,
      actorRef: session.principalRef,
      representedPrincipalRef: authorityContext.representedPrincipalRef,
      actingCapacityRef: authorityContext.actingCapacityRef,
      contextRef: authorityContext.contextRef,
      programRef: authorityContext.programRef,
      eventRef: `ESTATE-CONSOLE-EVENT:${artifact.artifactRef}`,
      action: "estate.artifact.submit",
      capabilityRef: "estate.artifact.submit",
      targetRef: artifact.artifactRef,
      authorityRefs: [...authorityContext.authorityRefs],
      policyRefs: [...authorityContext.policyRefs],
      representationSourceRefs: [...authorityContext.representationSourceRefs],
      requestedAt,
      correlationId: artifact.correlationId,
    };
  }
}
