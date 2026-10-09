import { describe, expect, it } from "vitest";
import { createPgBreakerStore, type PgClientLike, type PgPoolLike, type PgQueryResult } from "./awcePgBreakerStore.ts";
import { acquireProbe, closedCircuit, type BreakerState } from "./awceCircuitBreaker.ts";

class MemoryPg implements PgPoolLike {
  state: BreakerState | undefined;
  connections = 0;
  released = 0;
  commits = 0;
  rollbacks = 0;
  serializationFailures = 0;
  denyWrites = false;
  statements: string[] = [];

  async connect(): Promise<PgClientLike> {
    this.connections++;
    let pending = this.state ? structuredClone(this.state) : undefined;
    return {
      query: async (sql: string, values: unknown[] = []): Promise<PgQueryResult> => {
        this.statements.push(sql);
        if (sql.startsWith("BEGIN")) return { rows: [] };
        if (sql.startsWith("INSERT")) {
          if (!pending) pending = JSON.parse(values[1] as string) as BreakerState;
          return { rows: [] };
        }
        if (sql.startsWith("SELECT")) return { rows: pending ? [{ state: structuredClone(pending) }] : [] };
        if (sql.startsWith("UPDATE")) {
          if (this.denyWrites) throw Error("NO_WRITE_AUTHORITY");
          pending = JSON.parse(values[1] as string) as BreakerState;
          return { rows: [] };
        }
        if (sql === "COMMIT") {
          if (this.serializationFailures > 0) {
            this.serializationFailures--;
            throw Object.assign(new Error("serialization conflict"), { code: "40001" });
          }
          this.state = pending ? structuredClone(pending) : undefined;
          this.commits++;
          return { rows: [] };
        }
        if (sql === "ROLLBACK") {
          this.rollbacks++;
          return { rows: [] };
        }
        throw Error("UNEXPECTED_SQL");
      },
      release: () => { this.released++; },
    };
  }
}

describe("AWCE PostgreSQL serializable store R0.4", () => {
  it("performs atomic initial insert, row lock, update and commit", async () => {
    const db = new MemoryPg();
    const store = createPgBreakerStore(db);
    const result = await store.transact("circuit-1", current => {
      expect(current).toEqual(closedCircuit());
      return { next: { ...closedCircuit(), consecutiveFailures: 1 }, value: "admitted" };
    });
    expect(result).toBe("admitted");
    expect(db.state?.consecutiveFailures).toBe(1);
    expect(db.commits).toBe(1);
    expect(db.released).toBe(1);
    expect(db.statements[0]).toBe("BEGIN ISOLATION LEVEL SERIALIZABLE");
    expect(db.statements.some(s => s.includes("WHERE circuit_key = $1 FOR UPDATE"))).toBe(true);
    expect(db.statements.some(s => s.includes("UPDATE awce.breaker_state"))).toBe(true);
  });

  it("recomputes the pure state transition after serialization failure", async () => {
    const db = new MemoryPg();
    db.serializationFailures = 1;
    const store = createPgBreakerStore(db);
    const result = await store.transact("circuit-2", current => ({
      next: { ...(current ?? closedCircuit()), consecutiveFailures: (current?.consecutiveFailures ?? 0) + 1 },
      value: "stored",
    }));
    expect(result).toBe("stored");
    expect(db.state?.consecutiveFailures).toBe(1);
    expect(db.connections).toBe(2);
    expect(db.rollbacks).toBe(1);
    expect(db.released).toBe(2);
  });

  it("fails closed when serialization retry budget is exhausted", async () => {
    const db = new MemoryPg();
    db.serializationFailures = 5;
    const store = createPgBreakerStore(db, { maxAttempts: 2 });
    await expect(store.transact("circuit-3", current => ({
      next: current ?? closedCircuit(), value: true,
    }))).rejects.toThrow("serialization conflict");
    expect(db.commits).toBe(0);
    expect(db.released).toBe(2);
  });

  it("rolls back write failures without pretending to persist", async () => {
    const db = new MemoryPg();
    db.denyWrites = true;
    await expect(createPgBreakerStore(db).transact("circuit-4", () => ({
      next: closedCircuit(), value: true,
    }))).rejects.toThrow("NO_WRITE_AUTHORITY");
    expect(db.commits).toBe(0);
    expect(db.rollbacks).toBe(1);
    expect(db.released).toBe(1);
  });

  it("rejects invalid keys and retry budgets", async () => {
    const db = new MemoryPg();
    expect(() => createPgBreakerStore(db, { maxAttempts: 0 })).toThrow("INVALID_PG_RETRY_LIMIT");
    expect(() => createPgBreakerStore(db, { maxAttempts: 6 })).toThrow("INVALID_PG_RETRY_LIMIT");
    await expect(createPgBreakerStore(db).transact("", () => ({
      next: closedCircuit(), value: true,
    }))).rejects.toThrow("INVALID_CIRCUIT_KEY");
    expect(db.connections).toBe(0);
  });

  it("blocks malformed reducer state before any COMMIT", async () => {
    const db = new MemoryPg();
    await expect(createPgBreakerStore(db).transact("circuit-5", () => ({
      next: { phase: "OPEN", consecutiveFailures: -1, openedAt: null, recoveryLease: null } as BreakerState,
      value: true,
    }))).rejects.toThrow("INVALID_BREAKER_STATE");
    expect(db.commits).toBe(0);
    expect(db.rollbacks).toBe(1);
  });

  it("persists recovery probe leases for the router health adapter", async () => {
    const db = new MemoryPg();
    const store = createPgBreakerStore(db);
    const policy = { failureThreshold: 2, cooldownMs: 1000, leaseMs: 500, probeTimeoutMs: 150 };
    const admission = await store.transact("circuit-probe", current =>
      acquireProbe(current, 1000, "lease-1", policy));
    expect(admission.allowed).toBe(true);
    expect(db.state?.recoveryLease?.id).toBe("lease-1");
    const competing = await store.transact("circuit-probe", current =>
      acquireProbe(current, 1001, "lease-2", policy));
    expect(competing.allowed).toBe(false);
  });
});
