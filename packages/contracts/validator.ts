import { Ajv2020, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";

import pefEventSchema from "../../schemas/pef-event.v1.schema.json" with { type: "json" };
import triggerEvaluationSchema from "../../schemas/trigger-evaluation.v1.schema.json" with { type: "json" };

export interface ValidationResult {
  valid: boolean;
  errors: readonly ErrorObject[];
}

const ajv = new Ajv2020({ allErrors: true, strict: true });
const validateEvent = ajv.compile(pefEventSchema);
const validateTrigger = ajv.compile(triggerEvaluationSchema);

function run(validate: ValidateFunction, value: unknown): ValidationResult {
  const valid = validate(value);
  return { valid, errors: validate.errors ? [...validate.errors] : [] };
}

export function validatePefEventV1(value: unknown): ValidationResult {
  return run(validateEvent, value);
}

export function validateTriggerEvaluationV1(value: unknown): ValidationResult {
  return run(validateTrigger, value);
}
