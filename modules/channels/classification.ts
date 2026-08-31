import type { ChannelClassification } from "./contracts.ts";

const forbiddenFieldPattern =
  /(password|secret|api[_-]?key|apikey|access[_-]?token|accesstoken|refresh[_-]?token|refreshtoken|private[_-]?key|privatekey|credential)/i;

export function classificationAllowed(
  classification: ChannelClassification,
  allowed: readonly ChannelClassification[],
): boolean {
  return allowed.includes(classification);
}

export function assertProjectionFieldNameSafe(fieldName: string): void {
  if (forbiddenFieldPattern.test(fieldName)) {
    throw new Error(`projection_secret_field_forbidden:${fieldName}`);
  }
}
