import { sha256CanonicalV1 } from "./canonical.ts";
import type { LegislativeIntelligenceResultV1 } from "./service.ts";

export interface LegislativeIntelligenceResultStoreV1 {
  put(result: LegislativeIntelligenceResultV1): Promise<void>;
  getBySignalRef(signalRef: string): Promise<LegislativeIntelligenceResultV1 | undefined>;
}

export class InMemoryLegislativeIntelligenceResultStoreV1
  implements LegislativeIntelligenceResultStoreV1
{
  private readonly bySignalRef = new Map<string, LegislativeIntelligenceResultV1>();
  private readonly digestBySignalRef = new Map<string, string>();

  async put(result: LegislativeIntelligenceResultV1): Promise<void> {
    const signalRef = result.signal.signalRef;
    if (!signalRef) throw new Error("legislative_result_store_signal_ref_required");
    const digest = sha256CanonicalV1(result);
    const existingDigest = this.digestBySignalRef.get(signalRef);
    if (existingDigest !== undefined && existingDigest !== digest) {
      throw new Error("legislative_result_store_conflict");
    }
    if (existingDigest === undefined) {
      this.bySignalRef.set(signalRef, result);
      this.digestBySignalRef.set(signalRef, digest);
    }
  }

  async getBySignalRef(signalRef: string): Promise<LegislativeIntelligenceResultV1 | undefined> {
    return this.bySignalRef.get(signalRef);
  }
}
