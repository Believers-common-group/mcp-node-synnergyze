import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

describe("WARDEN-TRUST-FABRIC-001 persistence", () => {
  it("defines append-only Trust Receipt, status-event, and Trust Path storage", () => {
    const migrationPath = fileURLToPath(
      new URL("./sql/001_trust_receipt_and_path_store.sql", import.meta.url),
    );
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("CREATE TABLE IF NOT EXISTS vsr_trust_receipts");
    expect(migration).toContain("receipt_ref text PRIMARY KEY");
    expect(migration).toContain("supersedes_receipt_ref text REFERENCES vsr_trust_receipts(receipt_ref)");
    expect(migration).toContain("river_event_ref text NOT NULL");

    expect(migration).toContain("CREATE TABLE IF NOT EXISTS vsr_trust_receipt_status_events");
    expect(migration).toContain("status_event_ref text PRIMARY KEY");
    expect(migration).toContain("status text NOT NULL");

    expect(migration).toContain("CREATE TABLE IF NOT EXISTS vsr_trust_paths");
    expect(migration).toContain("trust_path_ref text PRIMARY KEY");
    expect(migration).toContain("required_assurance jsonb NOT NULL");
    expect(migration).toContain("observed_assurance jsonb NOT NULL");
    expect(migration).toContain("selected_receipt_refs jsonb NOT NULL");
    expect(migration).toContain("result text NOT NULL");

    expect(migration).toContain("CREATE FUNCTION vsr_trust_fabric_reject_mutation()");
    expect(migration).toContain("BEFORE UPDATE OR DELETE ON vsr_trust_receipts");
    expect(migration).toContain("BEFORE UPDATE OR DELETE ON vsr_trust_receipt_status_events");
    expect(migration).toContain("BEFORE UPDATE OR DELETE ON vsr_trust_paths");
  });
});
