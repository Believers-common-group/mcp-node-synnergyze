import { createHash } from "node:crypto";

import type {
  WardenDecisionV1,
  WardenExecutionCheckpointStateV1,
  WardenExecutionCheckpointV1,
} from "./contracts.ts";

export interface WardenExecutionCheckpointSourceV1 {
  check(input: {
    decision: Extract<WardenDecisionV1, { decision: "ALLOW" }>;
    checkedAt: string;
  }): WardenExecutionCheckpointV1;
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function parseInstant(value: string, errorCode: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(errorCode);
  return parsed;
}

/**
 * Synthetic Warden-owned checkpoint source for conformance tests.
 *
 * Work Capability consumes this source; it does not manufacture checkpoint
 * validity. A configured REVOKED/SUPERSEDED state models authority changing
 * after the original ALLOW. Expiry is always derived from the decision window.
 */
export class SyntheticWardenExecutionCheckpointServiceV1
  implements WardenExecutionCheckpointSourceV1
{
  constructor(
    private readonly currentState: WardenExecutionCheckpointStateV1 = "VALID",
  ) {}

  check(input: {
    decision: Extract<WardenDecisionV1, { decision: "ALLOW" }>;
    checkedAt: string;
  }): WardenExecutionCheckpointV1 {
    const { decision, checkedAt } = input;
    const decided = parseInstant(decision.decidedAt, "warden_checkpoint_decision_time_invalid");
    const checked = parseInstant(checkedAt, "warden_checkpoint_checked_at_invalid");
    if (checked < decided) throw new Error("warden_checkpoint_before_decision");

    let state = this.currentState;
    const reasonCodes: string[] = [];

    if (decision.validUntil) {
      const validUntil = parseInstant(
        decision.validUntil,
        "warden_checkpoint_decision_validity_invalid",
      );
      if (checked > validUntil) state = "EXPIRED";
    }

    switch (state) {
      case "VALID":
        reasonCodes.push("decision_active_at_execution_checkpoint");
        break;
      case "REVOKED":
        reasonCodes.push("authority_revoked_after_allow");
        break;
      case "SUPERSEDED":
        reasonCodes.push("authority_superseded_after_allow");
        break;
      case "EXPIRED":
        reasonCodes.push("decision_expired_before_execution");
        break;
    }

    const identity = JSON.stringify({
      decisionRef: decision.decisionRef,
      wardenRef: decision.wardenRef,
      correlationId: decision.correlationId,
      state,
      checkedAt,
      reasonCodes,
    });

    return {
      checkpointRef: `WARDEN-EXEC-CHECK:${digest(identity).slice(0, 24)}`,
      decisionRef: decision.decisionRef,
      wardenRef: decision.wardenRef,
      correlationId: decision.correlationId,
      state,
      checkedAt,
      reasonCodes,
    };
  }
}
