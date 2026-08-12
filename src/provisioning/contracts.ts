import { z } from "zod";

export const registryActorSchema = z.object({
  digitalmeId: z.string().min(1),
  actingCapacity: z.string().min(1),
  representedEntity: z.string().min(1).optional(),
});

export const registryCommandEnvelopeSchema = z.object({
  commandId: z.string().uuid(),
  commandType: z.enum([
    "PROGRAM_PROVISION",
    "SCHEDULE_PROPOSE",
    "SCHEDULE_BASELINE_APPROVE",
    "SCHEDULE_AMEND",
    "GATE_CHECK",
    "GATE_DECLARE",
    "GATE_HOLD",
    "EXCEPTION_REQUEST",
    "EXCEPTION_APPROVE",
    "EXCEPTION_DENY",
    "PACKAGE_INSTALL_REQUEST",
    "PACKAGE_ENABLE_REQUEST",
    "PACKAGE_SUSPEND_REQUEST",
    "PACKAGE_REVOKE_REQUEST",
  ]),
  subjectRef: z.string().min(1),
  actor: registryActorSchema,
  expectedRegistryVersion: z.number().int().positive().optional(),
  requestedEffectiveAt: z.string().datetime().optional(),
  evidenceRefs: z.array(z.string().min(1)).default([]),
  reason: z.string().min(1).optional(),
  correlationId: z.string().uuid(),
  idempotencyKey: z.string().min(8),
});

export const programProvisionRequestSchema = z.object({
  envelope: registryCommandEnvelopeSchema.extend({
    commandType: z.literal("PROGRAM_PROVISION"),
  }),
  templateRef: z.string().min(1),
  editionCode: z.string().min(2),
  authorityDomainRef: z.string().min(1).optional(),
  hostPlaceRef: z.string().min(1).optional(),
  externalConstraintRefs: z.array(z.string().min(1)).default([]),
  overrides: z.record(z.unknown()).default({}),
});

export const gateDeclareRequestSchema = z.object({
  envelope: registryCommandEnvelopeSchema.extend({
    commandType: z.literal("GATE_DECLARE"),
  }),
  gateEventRef: z.string().min(1),
  evidenceSetRef: z.string().min(1),
});

export const packageInstallRequestSchema = z.object({
  envelope: registryCommandEnvelopeSchema.extend({
    commandType: z.literal("PACKAGE_INSTALL_REQUEST"),
  }),
  packageRef: z.string().min(1),
  nodeRef: z.string().min(1),
  configurationRef: z.string().min(1).optional(),
});

export const registryDecisionSchema = z.object({
  decisionId: z.string().uuid(),
  disposition: z.enum([
    "ALLOW",
    "DENY",
    "CONDITIONAL",
    "REQUIRE_APPROVAL",
    "REQUIRE_EVIDENCE",
    "ESCALATE",
  ]),
  policyVersion: z.string().min(1),
  conditions: z.array(z.string()).default([]),
  reasonCodes: z.array(z.string()).default([]),
  validUntil: z.string().datetime().optional(),
});

export const temporalConditionSchema = z.object({
  conditionId: z.string().uuid(),
  conditionType: z.enum([
    "TIME_REACHED",
    "WINDOW_OPEN",
    "WINDOW_CLOSED",
    "DEADLINE_DUE",
    "DEADLINE_MISSED",
    "RECURRENCE_DUE",
    "DEPENDENCY_TIME_SATISFIED",
  ]),
  subjectRef: z.string().min(1),
  observedAt: z.string().datetime(),
  source: z.literal("SENTINEL_CLOCK"),
});

export type RegistryCommandEnvelope = z.infer<typeof registryCommandEnvelopeSchema>;
export type ProgramProvisionRequest = z.infer<typeof programProvisionRequestSchema>;
export type GateDeclareRequest = z.infer<typeof gateDeclareRequestSchema>;
export type PackageInstallRequest = z.infer<typeof packageInstallRequestSchema>;
export type RegistryDecision = z.infer<typeof registryDecisionSchema>;
export type TemporalCondition = z.infer<typeof temporalConditionSchema>;
