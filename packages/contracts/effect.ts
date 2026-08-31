export interface EffectVerificationV1 {
  schema_version: "effect-verification.v1";
  effect_verification_id: string;
  execution_id: string;
  status: "MATCHED" | "MISMATCHED" | "NOT_OBSERVED";
  expected_effect: Readonly<Record<string, unknown>>;
  observed_effect?: Readonly<Record<string, unknown>>;
  evidence_refs: readonly string[];
  verified_at: string;
}
