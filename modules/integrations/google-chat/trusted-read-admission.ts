/**
 * GEN-CON-GCHAT-001 — trusted, server-only read admission composition.
 *
 * Generates a non-executable preparedness receipt. There is NO Google MCP
 * transport, token retrieval, or externally callable endpoint in this module.
 * Every provider interface must be implemented by trusted internal services;
 * in particular the caller must not supply a Warden decision or River receipt.
 */
import { createHash } from "node:crypto";
import type { WardenDecisionV1, WardenExecutionCheckpointV1 } from "../../warden/contracts.ts";
import type { EvidenceReservationV1 } from "../../river/contracts.ts";
import {
  resolveTrustedGoogleChatContextV1,
  type GoogleChatTrustedContextResultV1,
  type TrustedGoogleChatContextSourcesV1,
} from "./trusted-context.ts";
import {
  evaluateGoogleChatReadGateV1,
  type GoogleChatPilotPolicyV1,
} from "./warden-read-gate.ts";

type TrustedContext = Extract<GoogleChatTrustedContextResultV1, { ok: true }>;

export interface VerifiedWardenReadDecisionV1 {
  decision: WardenDecisionV1;
  /** Attestation verified by internal Warden adapter, not a caller-provided string. */
  verificationRef: string;
  verified: true;
}

export interface RiverReadReservationBundleV1 {
  actionRef: string;
  reservation: EvidenceReservationV1;
  checkpoint: WardenExecutionCheckpointV1;
}

export type InternalGoogleChatReadIntentV1 = Readonly<{
  /** Selected from a server-held account registry, never arbitrary Chat messages. */
  accountBindingRef: string;
  spaceRef: string;
  tool: "list_messages" | "list_memberships";
  wardenRequestRef: string;
  correlationId: string;
}>;

export interface GoogleChatTrustedReadSourcesV1 {
  context: TrustedGoogleChatContextSourcesV1;
  /** All functions below must be injected exclusively by the Synnergyze backend. */
  getPolicy(context: TrustedContext): Promise<GoogleChatPilotPolicyV1>;
  getProviderGrantedScopes(context: TrustedContext): Promise<readonly string[]>;
  getVerifiedWardenDecision(
    context: TrustedContext,
    intent: InternalGoogleChatReadIntentV1,
  ): Promise<VerifiedWardenReadDecisionV1 | null>;
  reserveRiverEvidence(input: {
    context: TrustedContext;
    intent: InternalGoogleChatReadIntentV1;
    verified: VerifiedWardenReadDecisionV1;
  }): Promise<RiverReadReservationBundleV1 | null>;
  now(): string;
}

export type GoogleChatReadAdmissionResultV1 =
  | Readonly<{ ok: false; code: string }>
  | Readonly<{
      ok: true;
      state: "READ_READY_NO_EXTERNAL_EFFECT";
      connectorRef: "GEN-CON-GCHAT-001";
      tool: "list_messages" | "list_memberships";
      spaceRef: string;
      actorRef: string;
      principalRef: string;
      googleAccountBindingRef: string;
      wardenDecisionRef: string;
      wardenVerificationRef: string;
      riverReservationRef: string;
      wardenCheckpointRef: string;
      actionRef: string;
      correlationId: string;
    }>;

function denied(code: string): GoogleChatReadAdmissionResultV1 {
  return { ok: false, code };
}

function instant(value: string): number {
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? milliseconds : NaN;
}

function completeRef(value: string | undefined): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 256;
}

function verifyReservation(
  input: RiverReadReservationBundleV1,
  decision: WardenDecisionV1,
  now: string,
  correlationId: string,
): boolean {
  if (decision.decision !== "ALLOW" || !decision.actionToken) return false;
  if (!completeRef(input.actionRef) ||
      !completeRef(input.reservation.reservationRef) ||
      !completeRef(input.checkpoint.checkpointRef)) return false;
  const reservation = input.reservation;
  const checkpoint = input.checkpoint;
  if (reservation.state !== "RESERVED" ||
      reservation.actionRef !== input.actionRef ||
      reservation.wardenDecisionRef !== decision.decisionRef ||
      reservation.correlationId !== correlationId ||
      reservation.authorizationDigest !==
        "sha256:" + createHash("sha256").update(decision.actionToken, "utf8").digest("hex")) return false;
  if (checkpoint.state !== "VALID" ||
      checkpoint.decisionRef !== decision.decisionRef ||
      checkpoint.wardenRef !== decision.wardenRef ||
      checkpoint.correlationId !== correlationId) return false;
  const decidedAt = instant(decision.decidedAt);
  const reservedAt = instant(reservation.reservedAt);
  const checkedAt = instant(checkpoint.checkedAt);
  const nowAt = instant(now);
  return Number.isFinite(decidedAt) && Number.isFinite(reservedAt) &&
    Number.isFinite(checkedAt) && Number.isFinite(nowAt) &&
    decidedAt <= reservedAt && reservedAt <= checkedAt && checkedAt <= nowAt;
}

export async function prepareTrustedGoogleChatReadV1(
  sources: GoogleChatTrustedReadSourcesV1,
  intent: InternalGoogleChatReadIntentV1,
): Promise<GoogleChatReadAdmissionResultV1> {
  try {
    const now = sources.now();
    if (!Number.isFinite(instant(now))) return denied("invalid_server_time");
    const resolved = await resolveTrustedGoogleChatContextV1(sources.context, {
      accountBindingRef: intent.accountBindingRef,
      targetSpaceRef: intent.spaceRef,
      wardenRequestRef: intent.wardenRequestRef,
      correlationId: intent.correlationId,
      now,
    });
    if (!resolved.ok) return denied(resolved.code);
    const policy = await sources.getPolicy(resolved);
    const grantedScopes = await sources.getProviderGrantedScopes(resolved);
    if (!Array.isArray(grantedScopes)) return denied("provider_scopes_unavailable");
    const verified = await sources.getVerifiedWardenDecision(resolved, intent);
    if (!verified || verified.verified !== true ||
        !completeRef(verified.verificationRef)) return denied("warden_authority_unverified");
    const request = {
      tool: intent.tool,
      spaceRef: intent.spaceRef,
      actorRef: resolved.binding.actorRef,
      principalRef: resolved.binding.principalRef,
      providerAccountRef: resolved.binding.googleAccountBindingRef,
      consentRef: resolved.binding.consentRef,
      consentState: "ACTIVE" as const,
      consentSpaceRefs: [intent.spaceRef],
      grantedScopes,
      correlationId: intent.correlationId,
      wardenRequestRef: intent.wardenRequestRef,
      now,
    };
    const gate = evaluateGoogleChatReadGateV1(policy, request, verified.decision);
    if (!gate.permitted) return denied(gate.code);
    // This port is intentionally called only after a trusted Warden ALLOW.
    const evidence = await sources.reserveRiverEvidence({context: resolved, intent, verified});
    if (!evidence || !verifyReservation(evidence, verified.decision, now, intent.correlationId)) {
      return denied("river_reservation_or_checkpoint_invalid");
    }
    return {
      ok: true,
      state: "READ_READY_NO_EXTERNAL_EFFECT",
      connectorRef: "GEN-CON-GCHAT-001",
      tool: intent.tool,
      spaceRef: intent.spaceRef,
      actorRef: resolved.binding.actorRef,
      principalRef: resolved.binding.principalRef,
      googleAccountBindingRef: resolved.binding.googleAccountBindingRef,
      wardenDecisionRef: verified.decision.decisionRef,
      wardenVerificationRef: verified.verificationRef,
      riverReservationRef: evidence.reservation.reservationRef,
      wardenCheckpointRef: evidence.checkpoint.checkpointRef,
      actionRef: evidence.actionRef,
      correlationId: intent.correlationId,
    };
  } catch {
    // Internal lookup outage or evidence-service error: never authorize.
    return denied("trusted_read_admission_unavailable");
  }
}
