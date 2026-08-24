import { createHash } from "node:crypto";

import type { CausalTraceV1, EvidenceSealV1 } from "../river/contracts.ts";
import type { VerifiedEffectV1 } from "../synnergyze/effect-verification.ts";

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

interface StoredEvidenceFinalizationV1 {
  fingerprint: string;
  seal: EvidenceSealV1;
  causalTrace: CausalTraceV1;
}

export class SyntheticWorkCapabilityEvidenceFinalizerV1 {
  private readonly byEffectRef = new Map<string, StoredEvidenceFinalizationV1>();

  finalize(input: {
    reservationRef: string;
    correlationId: string;
    effect: VerifiedEffectV1;
    sealedAt: string;
  }): {
    seal: EvidenceSealV1;
    causalTrace: CausalTraceV1;
    idempotentReplay: boolean;
  } {
    const { reservationRef, correlationId, effect, sealedAt } = input;
    if (effect.reservationRef !== reservationRef) {
      throw new Error("work_capability_finalizer_reservation_mismatch");
    }
    if (effect.correlationId !== correlationId) {
      throw new Error("work_capability_finalizer_correlation_mismatch");
    }

    const verified = Date.parse(effect.verifiedAt);
    const sealed = Date.parse(sealedAt);
    if (!Number.isFinite(verified) || !Number.isFinite(sealed)) {
      throw new Error("work_capability_finalizer_invalid_time");
    }
    if (sealed < verified) {
      throw new Error("work_capability_finalizer_before_verification");
    }

    const fingerprint = digest(JSON.stringify({
      reservationRef,
      correlationId,
      effectRef: effect.effectRef,
      verificationRef: effect.verificationRef,
      verifiedAt: effect.verifiedAt,
      sealedAt,
    }));
    const existing = this.byEffectRef.get(effect.effectRef);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        throw new Error("work_capability_finalizer_idempotency_conflict");
      }
      return {
        seal: { ...existing.seal },
        causalTrace: {
          ...existing.causalTrace,
          eventReceiptRefs: [...existing.causalTrace.eventReceiptRefs],
        },
        idempotentReplay: true,
      };
    }

    const sealRef = `WORK-CAPABILITY-EVIDENCE-SEALED:${digest(
      `${reservationRef}|${effect.effectRef}|${effect.verificationRef}`,
    ).slice(0, 24)}`;
    const seal: EvidenceSealV1 = {
      sealRef,
      reservationRef,
      correlationId,
      state: "SEALED",
      traceDigest: [
        "RC1-TRACE-V1",
        reservationRef,
        sealRef,
        effect.effectRef,
        effect.verificationRef,
      ].join("|"),
      sealedAt,
    };
    const causalTrace: CausalTraceV1 = {
      correlationId,
      reservationRef,
      eventReceiptRefs: [],
      effectRef: effect.effectRef,
      sealRef,
      sealed: true,
    };

    this.byEffectRef.set(effect.effectRef, { fingerprint, seal, causalTrace });
    return {
      seal: { ...seal },
      causalTrace: { ...causalTrace, eventReceiptRefs: [] },
      idempotentReplay: false,
    };
  }
}
