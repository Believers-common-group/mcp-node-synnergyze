/**
 * AWCE R0.6 - persistent, non-reclaimable idempotency ledger.
 * No network or PostgreSQL connection at module import. The database pool is
 * supplied by an approved host and execution remains disabled by default.
 */
import type { ExecutionReceipt, RouteRequest, RouterPorts } from "./awceExecutionRouter.ts";
import type { PgClientLike, PgPoolLike } from "./awcePgBreakerStore.ts";

export type RecoverySnapshot =
  | { status: "NOT_FOUND" | "CONFLICT" | "UNAVAILABLE" | "NEEDS_RECONCILIATION" }
  | { status: "COMPLETED"; receiptId: string };

export interface DurableIdempotencyLedger {
  readonly idempotency: RouterPorts["idempotency"];
  /** Read-only; caller authenticates and authorizes access to the principal. */
  inspect(request: RouteRequest): Promise<RecoverySnapshot>;
}
interface LedgerRow {
  principal_id: string;
  request_id: string;
  capability: string;
  input_digest: string;
  status: "CLAIMED" | "COMPLETED";
  receipt_id: string | null;
  executor_id: string | null;
  reservation_id: string | null;
  output_digest: string | null;
}
const validField = (v: unknown, max = 256): v is string =>
  typeof v === "string" && v.length > 0 && v.length <= max &&
  v.trim() === v && !/[\u0000-\u001f]/.test(v);
const validRequest = (r: RouteRequest): boolean =>
  validField(r.requestId) && validField(r.principalId) &&
  validField(r.capability) && validField(r.inputDigest);
const validReceipt = (r: RouteRequest, p: ExecutionReceipt): boolean =>
  p?.verified === true && p.requestId === r.requestId &&
  validField(p.receiptId, 512) && validField(p.executorId) &&
  validField(p.reservationId) && validField(p.outputDigest);

async function withClient<T>(pool: PgPoolLike, action: (c: PgClientLike) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try { return await action(client); } finally { client.release(); }
}
function bindingsMatch(row: LedgerRow, r: RouteRequest): boolean {
  return row.principal_id === r.principalId && row.request_id === r.requestId
    && row.capability === r.capability && row.input_digest === r.inputDigest;
}
export function createPgIdempotencyLedger(pool: PgPoolLike): DurableIdempotencyLedger {
  const inspect = async (r: RouteRequest): Promise<RecoverySnapshot> => {
    if (!validRequest(r)) return { status: "CONFLICT" };
    try {
      return await withClient(pool, async client => {
        const query = await client.query(
          `SELECT principal_id, request_id, capability, input_digest, status,
                  receipt_id, executor_id, reservation_id, output_digest
             FROM awce.execution_claims WHERE principal_id=$1 AND request_id=$2`,
          [r.principalId, r.requestId],
        );
        if (query.rows.length === 0) return { status: "NOT_FOUND" };
        if (query.rows.length !== 1) return { status: "UNAVAILABLE" };
        const row = query.rows[0] as unknown as LedgerRow;
        if (!bindingsMatch(row, r)) return { status: "CONFLICT" };
        if (row.status === "CLAIMED" && row.receipt_id === null) {
          return { status: "NEEDS_RECONCILIATION" };
        }
        if (row.status === "COMPLETED" && validField(row.receipt_id, 512)
          && validField(row.executor_id) && validField(row.reservation_id)
          && validField(row.output_digest)) {
          return { status: "COMPLETED", receiptId: row.receipt_id };
        }
        return { status: "UNAVAILABLE" };
      });
    } catch { return { status: "UNAVAILABLE" }; }
  };

  return {
    inspect,
    idempotency: {
      claim: async (r): Promise<"ACQUIRED" | "DUPLICATE" | "UNAVAILABLE"> => {
        if (!validRequest(r)) return "UNAVAILABLE";
        try {
          return await withClient(pool, async client => {
            const result = await client.query(
              `INSERT INTO awce.execution_claims
                 (principal_id, request_id, capability, input_digest, status)
                 VALUES ($1,$2,$3,$4,'CLAIMED')
                 ON CONFLICT (principal_id,request_id) DO NOTHING
                 RETURNING request_id`,
              [r.principalId, r.requestId, r.capability, r.inputDigest],
            );
            return result.rows.length === 1 ? "ACQUIRED" : "DUPLICATE";
          });
        } catch {
          // Commit outcome might be unknown. Never retry under a new key.
          return "UNAVAILABLE";
        }
      },
      complete: async (r, receipt): Promise<boolean> => {
        if (!validRequest(r) || !validReceipt(r, receipt)) return false;
        try {
          return await withClient(pool, async client => {
            const result = await client.query(
              `UPDATE awce.execution_claims
                  SET status='COMPLETED', receipt_id=$5, executor_id=$6,
                      reservation_id=$7, output_digest=$8,
                      completed_at=clock_timestamp()
                WHERE principal_id=$1 AND request_id=$2
                  AND capability=$3 AND input_digest=$4 AND status='CLAIMED'
                RETURNING request_id`,
              [r.principalId, r.requestId, r.capability, r.inputDigest,
                receipt.receiptId, receipt.executorId, receipt.reservationId, receipt.outputDigest],
            );
            if (result.rows.length === 1) return true;
            const existing = await client.query(
              `SELECT status,receipt_id,executor_id,reservation_id,output_digest
                 FROM awce.execution_claims
                WHERE principal_id=$1 AND request_id=$2 AND capability=$3 AND input_digest=$4`,
              [r.principalId, r.requestId, r.capability, r.inputDigest],
            );
            if (existing.rows.length !== 1) return false;
            const row = existing.rows[0] as Record<string, unknown>;
            return row.status === "COMPLETED" && row.receipt_id === receipt.receiptId
              && row.executor_id === receipt.executorId
              && row.reservation_id === receipt.reservationId
              && row.output_digest === receipt.outputDigest;
          });
        } catch { return false; }
      },
    },
  };
}
export interface VerifiedRiverOutcome {
  verification: "VERIFIED";
  principalId: string;
  capability: string;
  inputDigest: string;
  receipt: ExecutionReceipt;
}
export interface RecoveryEvidencePort {
  /** Only look up signed/correlated pre-existing evidence. Never execute tools. */
  findVerifiedCompletion(request: RouteRequest): Promise<VerifiedRiverOutcome | null>;
}
/** Reconciliation contains NO execution port by design. */
export async function reconcileCompletedOperation(
  request: RouteRequest,
  ledger: DurableIdempotencyLedger,
  river: RecoveryEvidencePort,
): Promise<RecoverySnapshot> {
  const current = await ledger.inspect(request);
  if (current.status !== "NEEDS_RECONCILIATION") return current;
  let evidence: VerifiedRiverOutcome | null;
  try { evidence = await river.findVerifiedCompletion(request); }
  catch { return { status: "NEEDS_RECONCILIATION" }; }
  if (!evidence || evidence.verification !== "VERIFIED" ||
      evidence.principalId !== request.principalId ||
      evidence.capability !== request.capability ||
      evidence.inputDigest !== request.inputDigest ||
      !validReceipt(request, evidence.receipt)) {
    return { status: "NEEDS_RECONCILIATION" };
  }
  if (!(await ledger.idempotency.complete(request, evidence.receipt))) {
    return { status: "NEEDS_RECONCILIATION" };
  }
  return ledger.inspect(request);
}
