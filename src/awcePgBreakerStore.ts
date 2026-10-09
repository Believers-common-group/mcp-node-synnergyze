/**
 * AWCE R0.4 PostgreSQL transaction adapter for the R0.3 circuit breaker.
 * Connection and migrations are injected: importing does not contact a DB.
 *
 * Needs a PostgreSQL-compatible connection pool with parameterized queries.
 * Existing app does NOT instantiate or install this adapter.
 */
import {
  type AtomicBreakerStore,
  type BreakerState,
  type StateTransaction,
} from "./awceCircuitBreaker.ts";

export interface PgQueryResult {
  rows: Array<{ state?: unknown }>;
}
export interface PgClientLike {
  query(sql: string, values?: unknown[]): Promise<PgQueryResult>;
  release(): void;
}
export interface PgPoolLike {
  connect(): Promise<PgClientLike>;
}
export interface PgBreakerOptions {
  /** Bound serializable retry count, not an unbounded retry loop. */
  maxAttempts?: number;
}
const KEY_LIMIT = 1000;
const STATE_LIMIT = 4096;

function validState(value: unknown): BreakerState {
  const raw = typeof value === "string" ? JSON.parse(value) as unknown : value;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw Error("INVALID_BREAKER_STATE");
  }
  const state = raw as Partial<BreakerState>;
  const validPhase = state.phase === "CLOSED" || state.phase === "OPEN" || state.phase === "HALF_OPEN";
  const n = state.consecutiveFailures;
  const opened = state.openedAt;
  const lease = state.recoveryLease;
  const validOpened = opened === null || (typeof opened === "number" && Number.isFinite(opened));
  const validLease = lease === null ||
    (typeof lease === "object" && lease !== null &&
      typeof lease.id === "string" && lease.id.length > 0 &&
      typeof lease.expiresAt === "number" && Number.isFinite(lease.expiresAt));
  if (!validPhase || typeof n !== "number" || !Number.isSafeInteger(n) || n < 0 || !validOpened || !validLease ||
      (state.phase === "OPEN" && opened === null) ||
      (state.phase === "HALF_OPEN" && lease === null)) {
    throw Error("INVALID_BREAKER_STATE");
  }
  return raw as BreakerState;
}
function isSerializationConflict(e: unknown): boolean {
  if (typeof e !== "object" || !e) return false;
  const code = (e as { code?: unknown }).code;
  return code === "40001" || code === "40P01";
}
export function createPgBreakerStore(
  pool: PgPoolLike,
  options: PgBreakerOptions = {},
): AtomicBreakerStore {
  const maxAttempts = options.maxAttempts ?? 3;
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 5) {
    throw Error("INVALID_PG_RETRY_LIMIT");
  }
  return {
    async transact<T>(
      key: string,
      transition: (current: Readonly<BreakerState> | undefined) => StateTransaction<T>,
    ): Promise<T> {
      if (!key || key.length > KEY_LIMIT) throw Error("INVALID_CIRCUIT_KEY");
      let conflict: unknown;
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        // Each retry starts a fresh transaction and recomputes the transition
        // from the latest row. No transition callback may have outside effects.
        const client = await pool.connect();
        let begun = false;
        try {
          await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
          begun = true;
          await client.query(
            "INSERT INTO awce.breaker_state (circuit_key, state) VALUES ($1, $2::jsonb) ON CONFLICT (circuit_key) DO NOTHING",
            [key, JSON.stringify({ phase: "CLOSED", consecutiveFailures: 0, openedAt: null, recoveryLease: null })],
          );
          const selected = await client.query(
            "SELECT state FROM awce.breaker_state WHERE circuit_key = $1 FOR UPDATE",
            [key],
          );
          if (selected.rows.length !== 1) throw Error("BREAKER_ROW_NOT_FOUND");
          const existing = validState(selected.rows[0].state);
          const outcome = transition(existing);
          const next = validState(outcome.next);
          const encoded = JSON.stringify(next);
          if (encoded.length > STATE_LIMIT) throw Error("BREAKER_STATE_TOO_LARGE");
          await client.query(
            "UPDATE awce.breaker_state SET state = $2::jsonb, revision = revision + 1, updated_at = clock_timestamp() WHERE circuit_key = $1",
            [key, encoded],
          );
          await client.query("COMMIT");
          return outcome.value;
        } catch (e) {
          if (begun) {
            try { await client.query("ROLLBACK"); } catch {
              // No fallback to non-atomic writes. Failure remains visible.
            }
          }
          if (!isSerializationConflict(e)) throw e;
          conflict = e;
        } finally {
          client.release();
        }
      }
      throw conflict ?? Error("BREAKER_SERIALIZATION_RETRIES_EXHAUSTED");
    },
  };
}
