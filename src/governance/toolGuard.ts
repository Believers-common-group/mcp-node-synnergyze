/**
 * Synnergyze per-tool invocation boundary (R0.3).
 * The caller must supply a trusted server-side guard; MCP args are NOT authority.
 * This contract does not implement a signer or enable any telecom functionality.
 */
export type ToolGuardVerdict = Readonly<{
  decision: "ALLOW" | "HOLD" | "DENY";
  reasonCode: string;
  // Supplied by independently trusted Warden/River adapters, never by MCP arguments.
  authoritative?: boolean;
  wardenDecisionRef?: string;
  riverReceiptRef?: string;
  externalEffects?: boolean;
}>;

export type ToolInvocation = Readonly<{
  toolName: string;
  arguments: Readonly<Record<string, unknown>>;
}>;

export type ToolInvocationGuard = (
  invocation: ToolInvocation,
) => Promise<ToolGuardVerdict> | ToolGuardVerdict;

export type GovernanceRuntime =
  | Readonly<{ mode: "GOVERNED"; guard: ToolInvocationGuard }>
  | Readonly<{ mode?: "LEGACY"; guard?: never }>;

const RESERVED_GOVERNANCE_PREFIXES = Object.freeze([
  "warden.",
  "genesis.",
  "telco.",
  "subscriber.",
  "intercept.",
]);

export function isReservedGovernedTool(toolName: string): boolean {
  return RESERVED_GOVERNANCE_PREFIXES.some((prefix) => toolName.startsWith(prefix));
}

/**
 * This checks the result shape at the dispatch boundary, not its cryptographic
 * authenticity. The injected guard is responsible for verifying Warden
 * signatures, decisions, live River receipts, expiry, revocation, and replay.
 * Until that adapter exists, no production Warden guard can return ALLOW.
 */
export function canInvokeGovernedTool(verdict: ToolGuardVerdict | null | undefined): boolean {
  return verdict?.decision === "ALLOW" &&
    verdict.authoritative === true &&
    verdict.externalEffects === false &&
    typeof verdict.wardenDecisionRef === "string" &&
    verdict.wardenDecisionRef.length > 0 &&
    typeof verdict.riverReceiptRef === "string" &&
    verdict.riverReceiptRef.length > 0;
}

export function createDenyAllWardenGuard(): ToolInvocationGuard {
  return () => ({ decision: "HOLD", reasonCode: "LIVE_WARDEN_RIVER_VERIFIER_NOT_CONNECTED" });
}
