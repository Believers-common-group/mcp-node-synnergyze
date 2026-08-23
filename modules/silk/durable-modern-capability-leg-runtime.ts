import type { ModernJourneyDurableEventStoreV1 } from "./durable-modern-journey-runtime.ts";
import { validateModernJourneyEventRecordV1 } from "./modern-journey-event-log.ts";
import {
  rebuildModernCapabilityLegSnapshotV1,
} from "./modern-capability-leg-rehydration.ts";
import {
  SyntheticModernCapabilityLegRuntimeV1,
  type ModernCapabilityLegSnapshotV1,
} from "./modern-capability-leg.ts";

export class DurableModernCapabilityLegRuntimeV1 {
  private readonly runtimes = new Map<string, SyntheticModernCapabilityLegRuntimeV1>();
  private readonly persistedSequence = new Map<string, number>();
  private readonly poisonedLegs = new Set<string>();

  constructor(private readonly store: ModernJourneyDurableEventStoreV1) {}

  async open(
    input: Parameters<SyntheticModernCapabilityLegRuntimeV1["open"]>[0],
    recordedAt: string,
  ): Promise<ModernCapabilityLegSnapshotV1> {
    if (this.runtimes.has(input.legRef)) throw new Error("modern_durable_capability_leg_exists");
    const runtime = new SyntheticModernCapabilityLegRuntimeV1();
    this.runtimes.set(input.legRef, runtime);
    return this.persistSnapshot(runtime.open(input), recordedAt);
  }

  async recordReservation(
    input: Parameters<SyntheticModernCapabilityLegRuntimeV1["recordReservation"]>[0],
    recordedAt: string,
  ): Promise<ModernCapabilityLegSnapshotV1> {
    return this.apply(input.legRef, recordedAt, (runtime) => runtime.recordReservation(input));
  }

  async recordFailure(
    input: Parameters<SyntheticModernCapabilityLegRuntimeV1["recordFailure"]>[0],
    recordedAt: string,
  ): Promise<ModernCapabilityLegSnapshotV1> {
    return this.apply(input.legRef, recordedAt, (runtime) => runtime.recordFailure(input));
  }

  async recordRelease(
    input: Parameters<SyntheticModernCapabilityLegRuntimeV1["recordRelease"]>[0],
    recordedAt: string,
  ): Promise<ModernCapabilityLegSnapshotV1> {
    return this.apply(input.legRef, recordedAt, (runtime) => runtime.recordRelease(input));
  }

  async authorizeFallback(
    input: Parameters<SyntheticModernCapabilityLegRuntimeV1["authorizeFallback"]>[0],
    recordedAt: string,
  ): Promise<ModernCapabilityLegSnapshotV1> {
    return this.apply(input.legRef, recordedAt, (runtime) => runtime.authorizeFallback(input));
  }

  async recordExecution(
    input: Parameters<SyntheticModernCapabilityLegRuntimeV1["recordExecution"]>[0],
    recordedAt: string,
  ): Promise<ModernCapabilityLegSnapshotV1> {
    return this.apply(input.legRef, recordedAt, (runtime) => runtime.recordExecution(input));
  }

  async verifyAndClose(
    input: Parameters<SyntheticModernCapabilityLegRuntimeV1["verifyAndClose"]>[0],
    recordedAt: string,
  ): Promise<ModernCapabilityLegSnapshotV1> {
    return this.apply(input.legRef, recordedAt, (runtime) => runtime.verifyAndClose(input));
  }

  snapshot(legRef: string): ModernCapabilityLegSnapshotV1 {
    this.assertUsable(legRef);
    return this.requireRuntime(legRef).snapshot(legRef);
  }

  async reconstruct(legRef: string): Promise<ModernCapabilityLegSnapshotV1> {
    const events = await this.store.load(legRef);
    if (events.length === 0) throw new Error("modern_durable_capability_leg_stream_not_found");
    for (const event of events) validateModernJourneyEventRecordV1(event);
    return rebuildModernCapabilityLegSnapshotV1(events);
  }

  isPoisoned(legRef: string): boolean {
    return this.poisonedLegs.has(legRef);
  }

  private async apply(
    legRef: string,
    recordedAt: string,
    operation: (runtime: SyntheticModernCapabilityLegRuntimeV1) => ModernCapabilityLegSnapshotV1,
  ): Promise<ModernCapabilityLegSnapshotV1> {
    this.assertUsable(legRef);
    return this.persistSnapshot(operation(this.requireRuntime(legRef)), recordedAt);
  }

  private async persistSnapshot(
    snapshot: ModernCapabilityLegSnapshotV1,
    recordedAt: string,
  ): Promise<ModernCapabilityLegSnapshotV1> {
    const legRef = snapshot.leg.legRef;
    const alreadyPersisted = this.persistedSequence.get(legRef) ?? 0;
    const newEvents = snapshot.events.filter((event) => event.sequence > alreadyPersisted);

    try {
      let expectedSequence = alreadyPersisted + 1;
      for (const event of newEvents) {
        validateModernJourneyEventRecordV1(event);
        if (event.sequence !== expectedSequence) {
          throw new Error("modern_durable_capability_leg_sequence_gap");
        }
        const result = await this.store.put(event, recordedAt);
        if (result.state === "CONFLICT") {
          throw new Error("modern_durable_capability_leg_persistence_conflict");
        }
        if (!result.record || result.record.eventRef !== event.eventRef) {
          throw new Error("modern_durable_capability_leg_persistence_receipt_mismatch");
        }
        validateModernJourneyEventRecordV1(result.record);
        this.persistedSequence.set(legRef, event.sequence);
        expectedSequence += 1;
      }
    } catch (cause) {
      this.poisonedLegs.add(legRef);
      throw new Error("modern_durable_capability_leg_reconstruction_required", { cause });
    }

    return snapshot;
  }

  private assertUsable(legRef: string): void {
    if (this.poisonedLegs.has(legRef)) {
      throw new Error("modern_durable_capability_leg_reconstruction_required");
    }
  }

  private requireRuntime(legRef: string): SyntheticModernCapabilityLegRuntimeV1 {
    const runtime = this.runtimes.get(legRef);
    if (!runtime) throw new Error("modern_durable_capability_leg_not_found");
    return runtime;
  }
}