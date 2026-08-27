import { describe, expect, it } from "vitest";

import type {
  PostgresQueryExecutorV1,
  PostgresQueryResultV1,
} from "../synnergyze/postgres-remedy-journal.ts";
import { resolveTrustV1 } from "./resolver.ts";
import { PostgresTrustStoreV1 } from "./postgres-trust-store.ts";
import { createTrustPathV1 } from "./trust-path.ts";
import { createTrustReceiptStatusEventV1 } from "./trust-receipt-status.ts";
import { createTrustReceiptV1 } from "./trust-receipt.ts";

interface PlannedResponse {
  match: RegExp;
  rows?: unknown[];
  rowCount?: number;
}

class ScriptedDb implements PostgresQueryExecutorV1 {
  readonly calls: Array<{ sql: string; params: readonly unknown[] }> = [];

  constructor(private readonly plan: PlannedResponse[]) {}

  async query<T = Record<string, unknown>>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<PostgresQueryResultV1<T>> {
    this.calls.push({ sql, params });
    const step = this.plan.shift();
    if (!step) throw new Error(`unexpected_query:${sql}`);
    if (!step.match.test(sql)) throw new Error(`query_mismatch:${step.match}:${sql}`);
    return {
      rows: (step.rows ?? []) as T[],
      rowCount: step.rowCount ?? step.rows?.length ?? 0,
    };
  }
}

function receipt() {
  return createTrustReceiptV1({
    receiptType: "authority.role.current",
    subjectRef: "DIGITALME:BUYER-001",
    objectRef: "ENTERPRISE:ALPHA-001",
    issuerRef: "WARDEN:ENTERPRISE-001",
    verifierRef: "VERIFIER:AUTHORITY-001",
    claim: { role: "PROCUREMENT_APPROVER" },
    assurance: { identity: 4, authority: 4, compute: 3, evidence: 3 },
    policyRef: "POLICY:PROCUREMENT-001",
    evidenceRefs: ["RIVER-EVIDENCE:AUTHORITY-001"],
    issuedAt: "2026-08-25T04:00:00.000Z",
    validFrom: "2026-08-25T04:00:00.000Z",
    validUntil: "2026-08-25T06:00:00.000Z",
    riverEventRef: "RIVER-EVENT:AUTHORITY-001",
  });
}

function statusEvent(receiptRef = receipt().receiptRef) {
  return createTrustReceiptStatusEventV1({
    receiptRef,
    status: "REVOKED",
    reasonCode: "authority_withdrawn",
    authorityRef: "WARDEN:ENTERPRISE-001",
    verifierRef: "VERIFIER:AUTHORITY-001",
    evidenceRefs: ["RIVER-EVIDENCE:REVOCATION-001"],
    effectiveAt: "2026-08-25T04:30:00.000Z",
    observedAt: "2026-08-25T04:31:00.000Z",
    riverEventRef: "RIVER-EVENT:REVOCATION-001",
  });
}

function trustPath() {
  const request = {
    resolutionRef: "TRUST-RESOLUTION:STORE-001",
    actionRef: "payment.release",
    intendedEffect: { type: "payment.released", irreversible: true },
    requiredAssurance: { identity: 3 as const, authority: 4 as const, compute: 3 as const, evidence: 3 as const },
    observedAssurance: { identity: 4 as const, authority: 4 as const, compute: 4 as const, evidence: 4 as const },
    materialConflict: false,
  };
  return createTrustPathV1({
    request,
    resolution: resolveTrustV1(request),
    selectedReceiptRefs: [receipt().receiptRef],
    policyRef: "POLICY:PAYMENT-001",
    resolvedAt: "2026-08-25T04:20:00.000Z",
    validUntil: "2026-08-25T04:25:00.000Z",
    riverEventRef: "RIVER-EVENT:TRUST-PATH-STORE-001",
  });
}

describe("PostgresTrustStoreV1", () => {
  it("appends and reloads an immutable Trust Receipt", async () => {
    const value = receipt();
    const db = new ScriptedDb([
      { match: /^INSERT INTO vsr_trust_receipts/, rows: [{ receipt_ref: value.receiptRef }] },
      { match: /^SELECT receipt_json FROM vsr_trust_receipts/, rows: [{ receipt_json: JSON.stringify(value) }] },
    ]);
    const store = new PostgresTrustStoreV1(db);

    await expect(store.appendReceipt(value)).resolves.toEqual({ state: "STORED", receipt: value });
    await expect(store.getReceipt(value.receiptRef)).resolves.toEqual(value);
    expect(db.calls[0]?.sql).toContain("ON CONFLICT (receipt_ref) DO NOTHING");
  });

  it("fails closed when a receipt ref collision contains different persisted JSON", async () => {
    const value = receipt();
    const db = new ScriptedDb([
      { match: /^INSERT INTO vsr_trust_receipts/, rowCount: 0 },
      {
        match: /^SELECT receipt_json FROM vsr_trust_receipts/,
        rows: [{ receipt_json: JSON.stringify({ ...value, subjectRef: "DIGITALME:TAMPERED" }) }],
      },
    ]);

    await expect(new PostgresTrustStoreV1(db).appendReceipt(value)).rejects.toThrow(
      "trust_store_receipt_identity_conflict",
    );
  });

  it("appends a status event and resolves only status knowledge observed by the requested as-of time", async () => {
    const event = statusEvent();
    const db = new ScriptedDb([
      { match: /^INSERT INTO vsr_trust_receipt_status_events/, rows: [{ status_event_ref: event.statusEventRef }] },
      {
        match: /^SELECT status_event_json FROM vsr_trust_receipt_status_events/,
        rows: [{ status_event_json: JSON.stringify(event) }],
      },
      { match: /^SELECT status_event_json FROM vsr_trust_receipt_status_events/, rows: [] },
    ]);
    const store = new PostgresTrustStoreV1(db);

    await expect(store.appendReceiptStatus(event)).resolves.toEqual({ state: "STORED", event });
    await expect(store.getEffectiveReceiptStatus(event.receiptRef, "2026-08-25T04:31:30.000Z")).resolves.toEqual(event);
    await expect(store.getEffectiveReceiptStatus(event.receiptRef, "2026-08-25T04:30:30.000Z")).resolves.toBeUndefined();
    expect(db.calls[1]?.sql).toContain("effective_at <= $2");
    expect(db.calls[1]?.sql).toContain("observed_at <= $2");
  });

  it("persists and reloads an action-bound Trust Path by resolution reference", async () => {
    const value = trustPath();
    const db = new ScriptedDb([
      { match: /^INSERT INTO vsr_trust_paths/, rows: [{ trust_path_ref: value.trustPathRef }] },
      { match: /^SELECT trust_path_json FROM vsr_trust_paths/, rows: [{ trust_path_json: JSON.stringify(value) }] },
    ]);
    const store = new PostgresTrustStoreV1(db);

    await expect(store.appendTrustPath(value)).resolves.toEqual({ state: "STORED", path: value });
    await expect(store.getTrustPathByResolution(value.resolutionRef)).resolves.toEqual(value);
  });
});
