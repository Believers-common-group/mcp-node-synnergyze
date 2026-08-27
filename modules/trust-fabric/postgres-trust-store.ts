import type { PostgresQueryExecutorV1 } from "../synnergyze/postgres-remedy-journal.ts";
import type { TrustPathV1 } from "./trust-path.ts";
import type { TrustReceiptStatusEventV1 } from "./trust-receipt-status.ts";
import type { TrustReceiptV1 } from "./trust-receipt.ts";

export type TrustStoreAppendStateV1 = "STORED" | "IDEMPOTENT_REPLAY";

export interface TrustReceiptAppendResultV1 {
  state: TrustStoreAppendStateV1;
  receipt: TrustReceiptV1;
}

export interface TrustReceiptStatusAppendResultV1 {
  state: TrustStoreAppendStateV1;
  event: TrustReceiptStatusEventV1;
}

export interface TrustPathAppendResultV1 {
  state: TrustStoreAppendStateV1;
  path: TrustPathV1;
}

interface TrustReceiptRowV1 {
  receipt_json: TrustReceiptV1 | string;
}

interface TrustReceiptStatusRowV1 {
  status_event_json: TrustReceiptStatusEventV1 | string;
}

interface TrustPathRowV1 {
  trust_path_json: TrustPathV1 | string;
}

function parseJson<T>(value: T | string): T {
  return typeof value === "string" ? (JSON.parse(value) as T) : value;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)]);
    return Object.fromEntries(entries);
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function sameRecord(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

export class PostgresTrustStoreV1 {
  constructor(private readonly db: PostgresQueryExecutorV1) {}

  async appendReceipt(receipt: TrustReceiptV1): Promise<TrustReceiptAppendResultV1> {
    const inserted = await this.db.query<{ receipt_ref: string }>(
      `INSERT INTO vsr_trust_receipts
        (receipt_ref, receipt_type, subject_ref, object_ref, relationship_ref,
         issuer_ref, verifier_ref, claim, assurance, policy_ref, evidence_refs,
         issued_at, valid_from, valid_until, supersedes_receipt_ref,
         disclosure_policy_ref, river_event_ref, receipt_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11::jsonb,
               $12, $13, $14, $15, $16, $17, $18::jsonb)
       ON CONFLICT (receipt_ref) DO NOTHING
       RETURNING receipt_ref`,
      [
        receipt.receiptRef,
        receipt.receiptType,
        receipt.subjectRef,
        receipt.objectRef ?? null,
        receipt.relationshipRef ?? null,
        receipt.issuerRef,
        receipt.verifierRef,
        JSON.stringify(receipt.claim),
        JSON.stringify(receipt.assurance),
        receipt.policyRef,
        JSON.stringify(receipt.evidenceRefs),
        receipt.issuedAt,
        receipt.validFrom,
        receipt.validUntil ?? null,
        receipt.supersedesReceiptRef ?? null,
        receipt.disclosurePolicyRef ?? null,
        receipt.riverEventRef,
        JSON.stringify(receipt),
      ],
    );
    if (inserted.rowCount === 1) return { state: "STORED", receipt };

    const persisted = await this.getReceipt(receipt.receiptRef);
    if (!persisted) throw new Error("trust_store_receipt_conflict_missing_row");
    if (!sameRecord(persisted, receipt)) throw new Error("trust_store_receipt_identity_conflict");
    return { state: "IDEMPOTENT_REPLAY", receipt: persisted };
  }

  async getReceipt(receiptRef: string): Promise<TrustReceiptV1 | undefined> {
    const selected = await this.db.query<TrustReceiptRowV1>(
      `SELECT receipt_json FROM vsr_trust_receipts
       WHERE receipt_ref = $1`,
      [receiptRef],
    );
    const row = selected.rows[0];
    return row ? parseJson(row.receipt_json) : undefined;
  }

  async appendReceiptStatus(
    event: TrustReceiptStatusEventV1,
  ): Promise<TrustReceiptStatusAppendResultV1> {
    const inserted = await this.db.query<{ status_event_ref: string }>(
      `INSERT INTO vsr_trust_receipt_status_events
        (status_event_ref, receipt_ref, status, reason_code, effective_at, observed_at,
         issuer_ref, verifier_ref, superseding_receipt_ref, evidence_refs,
         river_event_ref, status_event_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12::jsonb)
       ON CONFLICT (status_event_ref) DO NOTHING
       RETURNING status_event_ref`,
      [
        event.statusEventRef,
        event.receiptRef,
        event.status,
        event.reasonCode,
        event.effectiveAt,
        event.observedAt,
        event.authorityRef,
        event.verifierRef ?? null,
        event.supersedingReceiptRef ?? null,
        JSON.stringify(event.evidenceRefs),
        event.riverEventRef,
        JSON.stringify(event),
      ],
    );
    if (inserted.rowCount === 1) return { state: "STORED", event };

    const selected = await this.db.query<TrustReceiptStatusRowV1>(
      `SELECT status_event_json FROM vsr_trust_receipt_status_events
       WHERE status_event_ref = $1`,
      [event.statusEventRef],
    );
    const row = selected.rows[0];
    if (!row) throw new Error("trust_store_status_conflict_missing_row");
    const persisted = parseJson(row.status_event_json);
    if (!sameRecord(persisted, event)) throw new Error("trust_store_status_identity_conflict");
    return { state: "IDEMPOTENT_REPLAY", event: persisted };
  }

  async getEffectiveReceiptStatus(
    receiptRef: string,
    asOf: string,
  ): Promise<TrustReceiptStatusEventV1 | undefined> {
    const selected = await this.db.query<TrustReceiptStatusRowV1>(
      `SELECT status_event_json FROM vsr_trust_receipt_status_events
       WHERE receipt_ref = $1
         AND effective_at <= $2
         AND observed_at <= $2
       ORDER BY effective_at DESC, observed_at DESC, status_event_ref DESC
       LIMIT 1`,
      [receiptRef, asOf],
    );
    const row = selected.rows[0];
    return row ? parseJson(row.status_event_json) : undefined;
  }

  async appendTrustPath(path: TrustPathV1): Promise<TrustPathAppendResultV1> {
    const inserted = await this.db.query<{ trust_path_ref: string }>(
      `INSERT INTO vsr_trust_paths
        (trust_path_ref, resolution_ref, action_ref, intended_effect, requirement_set_ref,
         required_assurance, observed_assurance, required_max_age_seconds,
         observed_age_seconds, selected_receipt_refs, selected_assurance_statement_refs,
         result, reason_codes, material, irreversible_effect, policy_ref,
         resolved_at, valid_until, river_event_ref, trust_path_json)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6::jsonb, $7::jsonb, $8::jsonb,
               $9::jsonb, $10::jsonb, $11::jsonb, $12, $13::jsonb, $14, $15,
               $16, $17, $18, $19, $20::jsonb)
       ON CONFLICT DO NOTHING
       RETURNING trust_path_ref`,
      [
        path.trustPathRef,
        path.resolutionRef,
        path.actionRef,
        JSON.stringify(path.intendedEffect),
        path.requirementSetRef ?? null,
        JSON.stringify(path.requiredAssurance),
        JSON.stringify(path.observedAssurance),
        JSON.stringify(path.requiredMaxAgeSeconds),
        JSON.stringify(path.observedAgeSeconds),
        JSON.stringify(path.selectedReceiptRefs),
        JSON.stringify(path.selectedAssuranceStatementRefs),
        path.result,
        JSON.stringify(path.reasonCodes),
        path.material,
        path.irreversibleEffect,
        path.policyRef,
        path.resolvedAt,
        path.validUntil ?? null,
        path.riverEventRef,
        JSON.stringify(path),
      ],
    );
    if (inserted.rowCount === 1) return { state: "STORED", path };

    const persisted = await this.getTrustPathByResolution(path.resolutionRef);
    if (!persisted) throw new Error("trust_store_path_conflict_missing_row");
    if (!sameRecord(persisted, path)) throw new Error("trust_store_path_identity_conflict");
    return { state: "IDEMPOTENT_REPLAY", path: persisted };
  }

  async getTrustPathByResolution(resolutionRef: string): Promise<TrustPathV1 | undefined> {
    const selected = await this.db.query<TrustPathRowV1>(
      `SELECT trust_path_json FROM vsr_trust_paths
       WHERE resolution_ref = $1`,
      [resolutionRef],
    );
    const row = selected.rows[0];
    return row ? parseJson(row.trust_path_json) : undefined;
  }
}
