import type { RiverEvent } from "./types.ts";

function sameEvent(a: RiverEvent, b: RiverEvent): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export class InMemoryEventLog {
  private readonly byId = new Map<string, RiverEvent>();
  private readonly byExecution = new Map<string, RiverEvent[]>();

  append(event: RiverEvent): RiverEvent {
    const existing = this.byId.get(event.eventId);
    if (existing) {
      if (!sameEvent(existing, event)) {
        throw new Error("EVENT_IDEMPOTENCY_CONFLICT");
      }
      return existing;
    }

    this.byId.set(event.eventId, event);
    const events = this.byExecution.get(event.executionId) ?? [];
    events.push(event);
    this.byExecution.set(event.executionId, events);
    return event;
  }

  eventsFor(executionId: string): readonly RiverEvent[] {
    return [...(this.byExecution.get(executionId) ?? [])];
  }
}
