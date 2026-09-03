import type { SyntheticCircularPassportSnapshotV01 } from "./circular-passport-fixture.ts";
import type { SyntheticRecoveryNodeSnapshotV01 } from "./recovery-node-fixture.ts";

export const VSR_QEL_RECOVERY_PASSPORT_BINDING_VERSION =
  "VSR-QEL-RECOVERY-PASSPORT-BINDING-001/0.1" as const;

export type RecoveryPassportBindingIssueV01 =
  | "recovery_asset_missing"
  | "recovery_cycle_missing"
  | "asset_mismatch"
  | "cycle_mismatch"
  | "passport_not_returnable"
  | "custody_not_bound";

export interface RecoveryPassportBindingResultV01 {
  contractVersion: typeof VSR_QEL_RECOVERY_PASSPORT_BINDING_VERSION;
  state: "MATCHED" | "BLOCKED";
  assetRef?: string;
  cycleRef?: string;
  custodyRef?: string;
  issues: readonly RecoveryPassportBindingIssueV01[];
}

const RETURNABLE_PASSPORT_STATES: readonly SyntheticCircularPassportSnapshotV01["lifecycleState"][] = [
  "ACTIVE_USE",
  "TRANSFERRED",
  "RETURN_PENDING",
  "RECOVERED",
  "ASSESSED",
  "REPAIR",
  "REFURBISH",
  "REUSE",
  "REMANUFACTURE",
  "RECYCLE",
];

const CUSTODY_STATES: readonly SyntheticRecoveryNodeSnapshotV01["nodeState"][] = [
  "ACCEPTED",
  "CUSTODY_HELD",
  "ASSESSMENT_PENDING",
  "ASSESSED",
  "ROUTING_PENDING",
  "ROUTED",
  "RELEASED",
];

export function bindRecoveryNodeToPassportV01(input: {
  recovery: SyntheticRecoveryNodeSnapshotV01;
  passport: SyntheticCircularPassportSnapshotV01;
}): RecoveryPassportBindingResultV01 {
  const issues: RecoveryPassportBindingIssueV01[] = [];
  const recoveryAssetRef = input.recovery.assetRef?.trim();
  const recoveryCycleRef = input.recovery.passportCycleRef?.trim();

  if (!recoveryAssetRef) issues.push("recovery_asset_missing");
  if (!recoveryCycleRef) issues.push("recovery_cycle_missing");

  if (recoveryAssetRef && recoveryAssetRef !== input.passport.assetRef) {
    issues.push("asset_mismatch");
  }
  if (recoveryCycleRef && recoveryCycleRef !== input.passport.cycleRef) {
    issues.push("cycle_mismatch");
  }
  if (!RETURNABLE_PASSPORT_STATES.includes(input.passport.lifecycleState)) {
    issues.push("passport_not_returnable");
  }
  if (CUSTODY_STATES.includes(input.recovery.nodeState) && !input.recovery.custodyRef?.trim()) {
    issues.push("custody_not_bound");
  }

  return {
    contractVersion: VSR_QEL_RECOVERY_PASSPORT_BINDING_VERSION,
    state: issues.length === 0 ? "MATCHED" : "BLOCKED",
    assetRef: recoveryAssetRef || undefined,
    cycleRef: recoveryCycleRef || undefined,
    custodyRef: input.recovery.custodyRef,
    issues,
  };
}
