import { createHash } from "node:crypto";

import type {
  NormalizedIntentV1,
  ProgramPlanDraftV1,
  QelExpressionRequestV1,
} from "./contracts.ts";

export const QEL_3_GRAMMAR_VERSION = "QEL-3.0" as const;

export type QelNormalizationErrorCodeV1 =
  | "PARSE_ERROR"
  | "UNKNOWN_SYMBOL"
  | "AMBIGUOUS_REFERENCE"
  | "SCHEMA_MISMATCH"
  | "UNSUPPORTED_EFFECT"
  | "MISSING_CONTEXT";

export interface QelParseEvidenceV1 {
  evidenceRef: string;
  grammarVersion: typeof QEL_3_GRAMMAR_VERSION;
  canonicalExpression: string;
  expressionDigest: string;
  sourceExpressionRef: string;
  normalizedAt: string;
  correlationId: string;
}

export interface QelNormalizationSuccessV1 {
  ok: true;
  intent: NormalizedIntentV1;
  plan: ProgramPlanDraftV1;
  evidence: QelParseEvidenceV1;
}

export interface QelNormalizationFailureV1 {
  ok: false;
  code: QelNormalizationErrorCodeV1;
  reason: string;
  expressionRef: string;
  correlationId: string;
}

export type QelNormalizationResultV1 =
  | QelNormalizationSuccessV1
  | QelNormalizationFailureV1;

interface ParsedQelExpressionV1 {
  actorRef: string;
  placeRef: string;
  action: string;
  thingRef: string;
  requestedEffect: string;
  capabilityRef?: string;
}

const REQUIRED_SEQUENCE = [
  "IF",
  "ACTOR",
  "IN",
  "PLACE",
  "ACTS",
  "ON",
  "THING",
  "THEN",
  "EFFECT",
] as const;

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function canonicalize(parsed: ParsedQelExpressionV1): string {
  const capability = parsed.capabilityRef
    ? ` USING CAPABILITY ${parsed.capabilityRef}`
    : "";

  return [
    "IF ACTOR",
    parsed.actorRef,
    "IN PLACE",
    parsed.placeRef,
    "ACTS",
    parsed.action,
    "ON THING",
    parsed.thingRef,
    "THEN EFFECT",
    parsed.requestedEffect,
  ].join(" ") + capability;
}

function parse(rawExpression: string):
  | { ok: true; value: ParsedQelExpressionV1 }
  | { ok: false; code: QelNormalizationErrorCodeV1; reason: string } {
  const tokens = rawExpression.trim().split(/\s+/).filter(Boolean);

  if (tokens.length === 0) {
    return { ok: false, code: "MISSING_CONTEXT", reason: "expression_empty" };
  }

  if (tokens.length < 14) {
    return { ok: false, code: "PARSE_ERROR", reason: "expression_incomplete" };
  }

  const expectedKeywords: Array<[number, string]> = [
    [0, REQUIRED_SEQUENCE[0]],
    [1, REQUIRED_SEQUENCE[1]],
    [3, REQUIRED_SEQUENCE[2]],
    [4, REQUIRED_SEQUENCE[3]],
    [6, REQUIRED_SEQUENCE[4]],
    [8, REQUIRED_SEQUENCE[5]],
    [9, REQUIRED_SEQUENCE[6]],
    [11, REQUIRED_SEQUENCE[7]],
    [12, REQUIRED_SEQUENCE[8]],
  ];

  for (const [index, expected] of expectedKeywords) {
    if (tokens[index] !== expected) {
      return {
        ok: false,
        code: "PARSE_ERROR",
        reason: `expected_${expected.toLowerCase()}_at_token_${index}`,
      };
    }
  }

  const base: ParsedQelExpressionV1 = {
    actorRef: tokens[2],
    placeRef: tokens[5],
    action: tokens[7],
    thingRef: tokens[10],
    requestedEffect: tokens[13],
  };

  if (!base.actorRef || !base.placeRef || !base.action || !base.thingRef || !base.requestedEffect) {
    return { ok: false, code: "MISSING_CONTEXT", reason: "required_qel_reference_missing" };
  }

  if (tokens.length === 14) {
    return { ok: true, value: base };
  }

  if (tokens.length === 17 && tokens[14] === "USING" && tokens[15] === "CAPABILITY") {
    if (!tokens[16]) {
      return { ok: false, code: "MISSING_CONTEXT", reason: "capability_ref_missing" };
    }
    return { ok: true, value: { ...base, capabilityRef: tokens[16] } };
  }

  return {
    ok: false,
    code: "UNKNOWN_SYMBOL",
    reason: `unsupported_trailing_tokens:${tokens.slice(14).join(" ")}`,
  };
}

export function normalizeQelExpressionV1(
  request: QelExpressionRequestV1,
): QelNormalizationResultV1 {
  const grammarVersion = request.grammarVersion ?? QEL_3_GRAMMAR_VERSION;
  if (grammarVersion !== QEL_3_GRAMMAR_VERSION) {
    return {
      ok: false,
      code: "SCHEMA_MISMATCH",
      reason: `unsupported_grammar_version:${grammarVersion}`,
      expressionRef: request.expressionRef,
      correlationId: request.correlationId,
    };
  }

  if (!request.actorRef || !request.contextRef || !request.sourceRef) {
    return {
      ok: false,
      code: "MISSING_CONTEXT",
      reason: "request_context_incomplete",
      expressionRef: request.expressionRef,
      correlationId: request.correlationId,
    };
  }

  const parsed = parse(request.rawExpression);
  if (!parsed.ok) {
    return {
      ok: false,
      code: parsed.code,
      reason: parsed.reason,
      expressionRef: request.expressionRef,
      correlationId: request.correlationId,
    };
  }

  if (parsed.value.actorRef !== request.actorRef) {
    return {
      ok: false,
      code: "AMBIGUOUS_REFERENCE",
      reason: "actor_ref_mismatch",
      expressionRef: request.expressionRef,
      correlationId: request.correlationId,
    };
  }

  const canonicalExpression = canonicalize(parsed.value);
  const expressionDigest = `sha256:${digest(canonicalExpression)}`;
  const identitySeed = digest(
    [request.expressionRef, canonicalExpression, request.contextRef, request.correlationId].join("|"),
  ).slice(0, 20);

  const intentRef = `QEL-INTENT:${identitySeed}`;
  const planRef = `QEL-PLAN:${identitySeed}`;
  const stepRef = `QEL-STEP:${identitySeed}:001`;
  const evidenceRef = `QEL-PARSE-EVIDENCE:${identitySeed}`;

  const intent: NormalizedIntentV1 = {
    intentRef,
    actorRef: parsed.value.actorRef,
    contextRef: request.contextRef,
    placeRef: parsed.value.placeRef,
    thingRef: parsed.value.thingRef,
    action: parsed.value.action,
    requestedEffect: parsed.value.requestedEffect,
    capabilityRef: parsed.value.capabilityRef,
    authorityState: "UNRESOLVED",
    authorized: false,
    sourceExpressionRef: request.expressionRef,
    correlationId: request.correlationId,
  };

  const requirementRefs = [
    "WARDEN_EVALUATION_REQUIRED",
    "AUTHORITY_RESOLUTION_REQUIRED",
  ];
  if (!parsed.value.capabilityRef) {
    requirementRefs.push("CAPABILITY_RESOLUTION_REQUIRED");
  }

  const plan: ProgramPlanDraftV1 = {
    planRef,
    intentRef,
    status: "DRAFT",
    authorized: false,
    steps: [
      {
        stepRef,
        action: parsed.value.action,
        targetRef: parsed.value.thingRef,
        dependencyRefs: [parsed.value.placeRef],
        requirementRefs,
      },
    ],
    dependencyRefs: [parsed.value.placeRef, parsed.value.thingRef],
    constraintRefs: [
      "QEL_NO_AUTHORIZATION",
      "QEL_NO_EXECUTION",
      "QEL_NO_EFFECT_VERIFICATION",
    ],
    correlationId: request.correlationId,
  };

  const evidence: QelParseEvidenceV1 = {
    evidenceRef,
    grammarVersion: QEL_3_GRAMMAR_VERSION,
    canonicalExpression,
    expressionDigest,
    sourceExpressionRef: request.expressionRef,
    normalizedAt: request.submittedAt,
    correlationId: request.correlationId,
  };

  return { ok: true, intent, plan, evidence };
}
