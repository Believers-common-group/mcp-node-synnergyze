import type { WardenDecisionRequestV1, WardenDecisionV1 } from "./contracts.ts";
import {
  buildRuntimeWardenDecisionReceipt,
  type AuthenticatedPrincipalBindingV1,
  type RuntimeEffectPolicyV1,
} from "./runtime-authz-bridge.ts";
import {
  signProducerReceipt,
  type ProducerSigningInputV1,
} from "./producer-signature.ts";

export interface SignedRuntimeDecisionExportInputV1 {
  request: WardenDecisionRequestV1;
  decision: WardenDecisionV1;
  principal: AuthenticatedPrincipalBindingV1;
  effectPolicy: RuntimeEffectPolicyV1;
  consentRefs?: readonly string[];
  signing?: ProducerSigningInputV1;
}

function resolveSigning(input: SignedRuntimeDecisionExportInputV1): ProducerSigningInputV1 {
  if (input.signing) return input.signing;
  return {
    privateKeyPem: process.env.WARDEN_RUNTIME_SIGNING_KEY_PEM ?? "",
    keyId: process.env.WARDEN_RUNTIME_SIGNING_KEY_ID ?? "",
  };
}

export function buildSignedRuntimeWardenDecisionReceipt(
  input: SignedRuntimeDecisionExportInputV1,
) {
  const unsigned = buildRuntimeWardenDecisionReceipt({
    request: input.request,
    decision: input.decision,
    principal: input.principal,
    effectPolicy: input.effectPolicy,
    consentRefs: input.consentRefs,
  });
  return signProducerReceipt(unsigned, resolveSigning(input));
}
