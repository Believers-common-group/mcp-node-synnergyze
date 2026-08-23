import type { ModernJourneyEventRecordV1 } from "./modern-journey-event-log.ts";
import { rebuildModernJourneyRuntimeSnapshotV1 } from "./modern-journey-rehydration.ts";
import {
  SyntheticModernJourneyTransactionRuntimeV1,
  type ModernJourneyRuntimeSnapshotV1,
} from "./modern-journey-runtime.ts";
import type { ModernJourneyEventStoreWriteResultV1 } from "./postgres-modern-journey-event-store.ts";

export interface ModernJourneyDurableEventStoreV1 {
  put(
    record: ModernJourneyEventRecordV1,
    recordedAt: string,
  ): Promise<ModernJourneyEventStoreWriteResultV1>;
  load(transactionRef: string): Promise<readonly ModernJourneyEventRecordV1[]>;
}

export class DurableModernJourneyTransactionRuntimeV1 {
  private readonly runtimes = new Map<string, SyntheticModernJourneyTransactionRuntimeV1>();
  private readonly persistedSequence = new Map<string, number>();
  private readonly poisonedTransactions = new Set<string>();

  constructor(private readonly store: ModernJourneyDurableEventStoreV1) {}

  async open(
    input: Parameters<SyntheticModernJourneyTransactionRuntimeV1["open"]>[0],
    recordedAt: string,
  ): Promise<ModernJourneyRuntimeSnapshotV1> {
    if (this.runtimes.has(input.transactionRef)) throw new Error("modern_durable_runtime_transaction_exists");
    const runtime = new SyntheticModernJourneyTransactionRuntimeV1();
    this.runtimes.set(input.transactionRef, runtime);
    const snapshot = runtime.open(input);
    return this.persistSnapshot(snapshot, recordedAt);
  }

  async recordReservation(
    input: Parameters<SyntheticModernJourneyTransactionRuntimeV1["recordReservation"]>[0],
    recordedAt: string,
  ): Promise<ModernJourneyRuntimeSnapshotV1> {
    return this.apply(input.transactionRef, recordedAt, (runtime) => runtime.recordReservation(input));
  }

  async recordProviderFailure(
    input: Parameters<SyntheticModernJourneyTransactionRuntimeV1["recordProviderFailure"]>[0],
    recordedAt: string,
  ): Promise<ModernJourneyRuntimeSnapshotV1> {
    return this.apply(input.transactionRef, recordedAt, (runtime) => runtime.recordProviderFailure(input));
  }

  async recordRelease(
    input: Parameters<SyntheticModernJourneyTransactionRuntimeV1["recordRelease"]>[0],
    recordedAt: string,
  ): Promise<ModernJourneyRuntimeSnapshotV1> {
    return this.apply(input.transactionRef, recordedAt, (runtime) => runtime.recordRelease(input));
  }

  async authorizeFallback(
    input: Parameters<SyntheticModernJourneyTransactionRuntimeV1["authorizeFallback"]>[0],
    recordedAt: string,
  ): Promise<ModernJourneyRuntimeSnapshotV1> {
    return this.apply(input.transactionRef, recordedAt, (runtime) => runtime.authorizeFallback(input));
  }

  async recordProviderExecution(
    input: Parameters<SyntheticModernJourneyTransactionRuntimeV1["recordProviderExecution"]>[0],
    recordedAt: string,
  ): Promise<ModernJourneyRuntimeSnapshotV1> {
    return this.apply(input.transactionRef, recordedAt, (runtime) => runtime.recordProviderExecution(input));
  }

  async verifyAndClose(
    input: Parameters<SyntheticModernJourneyTransactionRuntimeV1["verifyAndClose"]>[0],
    recordedAt: string,
  ): Promise<ModernJourneyRuntimeSnapshotV1> {
    return this.apply(input.transactionRef, recordedAt, (runtime) => runtime.verifyAndClose(input));
  }

  snapshot(transactionRef: string): ModernJourneyRuntimeSnapshotV1 {
    this.assertUsable(transactionRef);
    return this.requireRuntime(transactionRef).snapshot(transactionRef);
  }

  async reconstruct(transactionRef: string): Promise<ModernJourneyRuntimeSnapshotV1> {
    const events = await this.store.load(transactionRef);
    if (events.length === 0) throw new Error("modern_durable_runtime_persisted_stream_not_found");
    return rebuildModernJourneyRuntimeSnapshotV1(events);
  }

  isPoisoned(transactionRef: string): boolean {
    return this.poisonedTransactions.has(transactionRef);
  }

  private async apply(
    transactionRef: string,
    recordedAt: string,
    operation: (runtime: SyntheticModernJourneyTransactionRuntimeV1) => ModernJourneyRuntimeSnapshotV1,
  ): Promise<ModernJourneyRuntimeSnapshotV1> {
    this.assertUsable(transactionRef);
    const snapshot = operation(this.requireRuntime(transactionRef));
    return this.persistSnapshot(snapshot, recordedAt);
  }

  private async persistSnapshot(
    snapshot: ModernJourneyRuntimeSnapshotV1,
    recordedAt: string,
  ): Promise<ModernJourneyRuntimeSnapshotV1> {
    const transactionRef = snapshot.transaction.transactionRef;
    const alreadyPersisted = this.persistedSequence.get(transactionRef) ?? 0;
    const newEvents = snapshot.events.filter((event) => event.sequence > alreadyPersisted);

    try {
      let expectedSequence = alreadyPersisted + 1;
      for (const event of newEvents) {
        if (event.sequence !== expectedSequence) {
          throw new Error("modern_durable_runtime_persistence_sequence_gap");
        }
        const result = await this.store.put(event, recordedAt);
        if (result.state === "CONFLICT") {
          throw new Error("modern_durable_runtime_persistence_conflict");
        }
        if (!result.record || result.record.eventRef !== event.eventRef) {
          throw new Error("modern_durable_runtime_persistence_receipt_mismatch");
        }
        this.persistedSequence.set(transactionRef, event.sequence);
        expectedSequence += 1;
      }
    } catch (cause) {
      this.poisonedTransactions.add(transactionRef);
      throw new Error("modern_durable_runtime_reconstruction_required", { cause });
    }

    return snapshot;
  }

  private assertUsable(transactionRef: string): void {
    if (this.poisonedTransactions.has(transactionRef)) {
      throw new Error("modern_durable_runtime_reconstruction_required");
    }
  }

  private requireRuntime(transactionRef: string): SyntheticModernJourneyTransactionRuntimeV1 {
    const runtime = this.runtimes.get(transactionRef);
    if (!runtime) throw new Error("modern_durable_runtime_transaction_not_found");
    return runtime;
  }
}