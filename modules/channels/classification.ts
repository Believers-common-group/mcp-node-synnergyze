import type { ChannelClassification, JsonValue } from "./contracts.ts";

const forbiddenFieldPattern =
  /(password|secret|api[_-]?key|apikey|access[_-]?token|accesstoken|refresh[_-]?token|refreshtoken|private[_-]?key|privatekey|credential)/i;

export function classificationAllowed(
  classification: ChannelClassification,
  allowed: readonly ChannelClassification[],
): boolean {
  return allowed.includes(classification);
}

export function assertProjectionFieldNameSafe(fieldName: string, path = fieldName): void {
  if (forbiddenFieldPattern.test(fieldName)) {
    throw new Error(`projection_secret_field_forbidden:${path}`);
  }
}

export function assertProjectionValueSafe(value: JsonValue, path: string): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertProjectionValueSafe(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;

  for (const [fieldName, nested] of Object.entries(value)) {
    const nestedPath = `${path}.${fieldName}`;
    assertProjectionValueSafe(nested, nestedPath);
    assertProjectionFieldNameSafe(fieldName, nestedPath);
  }
}
