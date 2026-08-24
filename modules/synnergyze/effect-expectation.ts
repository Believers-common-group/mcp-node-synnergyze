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

function matcherEquals(left: EffectMatcherV1, right: EffectMatcherV1): boolean {
  return left.kind === right.kind && left.value === right.value;
}

function sourceDigestFor(input: {
  actionRef: string;
  reservationRef: string;
  wardenDecisionRef: string;
  programRef: string;
  eventRef: string;
  capabilityRef: string;
  targetRef: string;
  requestedEffect: string;
  correlationId: string;
  compilerRef: string;
  matcher: EffectMatcherV1;
  compiledAt: string;
}): string {
  return `sha256:${digest(JSON.stringify(input))}`;
}

function expectationRefFor(actionRef: string, sourceDigest: string): string {
  return `EXPECTED-EFFECT:${digest(`${actionRef}|${sourceDigest}`).slice(0, 24)}`;
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

export class SyntheticGarmentWaistbandExpectationCompilerV1
  implements EffectExpectationCompilerV1
{
  readonly compilerRef = "SYNTHETIC-GARMENT-WAISTBAND-EXPECTATION-COMPILER-001";
  readonly capabilityRef = "garment.waistband.attach";

  compile(requestedEffect: string): EffectMatcherV1 {
    if (requestedEffect !== "GARMENT-STATE:waistband_attached") {
      throw new Error("effect_expectation_unsupported_requested_effect");
    }
    return { kind: "PREFIX", value: "GARMENT-WAISTBAND-OBSERVED:" };
  }
}

function trustedCompilerFor(capabilityRef: string): EffectExpectationCompilerV1 | undefined {
  if (capabilityRef === "service_request.create") {
    return new SyntheticServiceRequestExpectationCompilerV1();
  }
  if (capabilityRef === "garment.waistband.attach") {
    return new SyntheticGarmentWaistbandExpectationCompilerV1();
  }
  return undefined;
}

/**
 * Re-validates a supplied expectation against trusted compiler semantics and
 * its deterministic identity. This prevents a caller from mutating the
 * matcher, compiler identity, source digest, or binding timestamp after
 * execution and still presenting the contract as the original expectation.
 */
export function validateExpectedEffectContractV1(
  expectation: ExpectedEffectContractV1,
): boolean {
  if (
    expectation.version !== "EXPECTED-EFFECT-CONTRACT-001" ||
    expectation.state !== "BOUND_PRE_EXECUTION" ||
    expectation.synthetic !== true ||
    !Number.isFinite(Date.parse(expectation.compiledAt))
  ) {
    return false;
  }

  const compiler = trustedCompilerFor(expectation.capabilityRef);
  if (!compiler || compiler.compilerRef !== expectation.compilerRef) return false;

  let trustedMatcher: EffectMatcherV1;
  try {
    trustedMatcher = compiler.compile(expectation.requestedEffect);
  } catch {
    return false;
  }
  if (!matcherEquals(trustedMatcher, expectation.matcher)) return false;

  const sourceDigest = sourceDigestFor({
    actionRef: expectation.actionRef,
    reservationRef: expectation.reservationRef,
    wardenDecisionRef: expectation.wardenDecisionRef,
    programRef: expectation.programRef,
    eventRef: expectation.eventRef,
    capabilityRef: expectation.capabilityRef,
    targetRef: expectation.targetRef,
    requestedEffect: expectation.requestedEffect,
    correlationId: expectation.correlationId,
    compilerRef: expectation.compilerRef,
    matcher: expectation.matcher,
    compiledAt: expectation.compiledAt,
  });

  return (
    expectation.sourceDigest === sourceDigest &&
    expectation.expectationRef === expectationRefFor(expectation.actionRef, sourceDigest)
  );
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

    const existing = this.byActionRef.get(action.actionRef);
    if (existing) {
      if (
        existing.reservationRef !== reservation.reservationRef ||
        existing.wardenDecisionRef !== action.wardenDecisionRef ||
        existing.programRef !== action.programRef ||
        existing.eventRef !== action.eventRef ||
        existing.capabilityRef !== action.capabilityRef ||
        existing.targetRef !== action.targetRef ||
        existing.requestedEffect !== action.requestedEffect ||
        existing.correlationId !== action.correlationId ||
        existing.compilerRef !== compiler.compilerRef ||
        !matcherEquals(existing.matcher, matcher) ||
        !validateExpectedEffectContractV1(existing)
      ) {
        throw new Error("effect_expectation_idempotency_conflict");
      }
      return { ...existing, matcher: { ...existing.matcher } };
    }

    const sourceDigest = sourceDigestFor({
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
      compiledAt,
    });
    const expectation: ExpectedEffectContractV1 = {
      version: "EXPECTED-EFFECT-CONTRACT-001",
      expectationRef: expectationRefFor(action.actionRef, sourceDigest),
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
