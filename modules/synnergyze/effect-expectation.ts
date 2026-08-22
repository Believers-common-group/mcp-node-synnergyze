import { createHash } from "node:crypto";

import type { ActionEnvelopeV1, EvidenceReservationV1 } from "../river/contracts.ts";

export type EffectMatcherV1 =
  | { kind: "EXACT"; value: string }
  | { kind: "PREFIX"; value: string };

export interface ExpectedEffectContractV1 {
  version: "EXPECTED-EFFECT-CONTRACT-001";
  expectationRef: string;
  actionRef: string;
  reservationRef: string;
  wardenDecisionRef: string;
  programRef: string;
  eventRef: string;
  capabilityRef: string;
  targetRef: string;
  requestedEffect: string;
  correlationId: string;
  matcher: EffectMatcherV1;
  compilerRef: string;
  sourceDigest: string;
  compiledAt: string;
  state: "BOUND_PRE_EXECUTION";
  synthetic: true;
}

export interface EffectExpectationCompilerV1 {
  readonly compilerRef: string;
  readonly capabilityRef: string;
  compile(requestedEffect: string): EffectMatcherV1;
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function parseInstant(value: string, errorCode: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(errorCode);
  return parsed;
}

export class SyntheticServiceRequestExpectationCompilerV1 implements EffectExpectationCompilerV1 {
  readonly compilerRef = "SYNTHETIC-SERVICE-REQUEST-EXPECTATION-COMPILER-001";
  readonly capabilityRef = "service_request.create";

  compile(requestedEffect: string): EffectMatcherV1 {
    if (requestedEffect !== "service_request.created") {
      throw new Error("effect_expectation_unsupported_requested_effect");
    }
    return { kind: "PREFIX", value: "SYNTHETIC-SERVICE-REQUEST-STATE:CREATED:" };
  }
}

export class EffectExpectationServiceV1 {
  private readonly compilers: ReadonlyMap<string, EffectExpectationCompilerV1>;
  private readonly byActionRef = new Map<string, ExpectedEffectContractV1>();

  constructor(compilers: readonly EffectExpectationCompilerV1[]) {
    this.compilers = new Map(compilers.map((compiler) => [compiler.capabilityRef, compiler]));
  }

  compile(input: {
    action: ActionEnvelopeV1;
    reservation: EvidenceReservationV1;
    compiledAt: string;
  }): ExpectedEffectContractV1 {
    const { action, reservation, compiledAt } = input;
    if (!action.requestedEffect?.trim()) throw new Error("effect_expectation_requested_effect_required");
    if (reservation.state !== "RESERVED") throw new Error("effect_expectation_reservation_required");
    if (reservation.actionRef !== action.actionRef) throw new Error("effect_expectation_action_mismatch");
    if (reservation.wardenDecisionRef !== action.wardenDecisionRef) {
      throw new Error("effect_expectation_decision_mismatch");
    }
    if (reservation.correlationId !== action.correlationId) {
      throw new Error("effect_expectation_correlation_mismatch");
    }
    const reservedAt = parseInstant(reservation.reservedAt, "effect_expectation_invalid_reservation_time");
    const compiled = parseInstant(compiledAt, "effect_expectation_invalid_compilation_time");
    if (compiled < reservedAt) throw new Error("effect_expectation_before_reservation");

    const compiler = this.compilers.get(action.capabilityRef);
    if (!compiler) throw new Error(`effect_expectation_compiler_not_registered:${action.capabilityRef}`);
    const matcher = compiler.compile(action.requestedEffect);
    if (!matcher.value.trim()) throw new Error("effect_expectation_empty_matcher");

    const sourceDigest = `sha256:${digest(JSON.stringify({
      actionRef: action.actionRef,
      reservationRef: reservation.reservationRef,
      wardenDecisionRef: action.wardenDecisionRef,
      programRef: action.programRef,
      eventRef: action.eventRef,
      capabilityRef: action.capabilityRef,
      targetRef: action.targetRef,
      requestedEffect: action.requestedEffect,
      correlationId: action.correlationId,
      compilerRef: compiler.compilerRef,
      matcher,
    }))}`;
    const existing = this.byActionRef.get(action.actionRef);
    if (existing) {
      if (existing.sourceDigest !== sourceDigest) throw new Error("effect_expectation_idempotency_conflict");
      return { ...existing, matcher: { ...existing.matcher } };
    }

    const expectation: ExpectedEffectContractV1 = {
      version: "EXPECTED-EFFECT-CONTRACT-001",
      expectationRef: `EXPECTED-EFFECT:${digest(`${action.actionRef}|${sourceDigest}`).slice(0, 24)}`,
      actionRef: action.actionRef,
      reservationRef: reservation.reservationRef,
      wardenDecisionRef: action.wardenDecisionRef,
      programRef: action.programRef,
      eventRef: action.eventRef,
      capabilityRef: action.capabilityRef,
      targetRef: action.targetRef,
      requestedEffect: action.requestedEffect,
      correlationId: action.correlationId,
      matcher,
      compilerRef: compiler.compilerRef,
      sourceDigest,
      compiledAt,
      state: "BOUND_PRE_EXECUTION",
      synthetic: true,
    };
    this.byActionRef.set(action.actionRef, expectation);
    return { ...expectation, matcher: { ...expectation.matcher } };
  }

  count(): number {
    return this.byActionRef.size;
  }
}

export function matchesExpectedEffectV1(
  expectation: ExpectedEffectContractV1,
  observedStateRef: string,
): boolean {
  if (!observedStateRef.trim()) return false;
  switch (expectation.matcher.kind) {
    case "EXACT":
      return observedStateRef === expectation.matcher.value;
    case "PREFIX":
      return observedStateRef.startsWith(expectation.matcher.value);
  }
}
