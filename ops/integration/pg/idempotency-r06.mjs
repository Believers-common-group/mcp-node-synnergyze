/**
 * AWCE R0.6 disposable PostgreSQL integration. No external services.
 * Run only inside a GitHub Actions ephemeral service with synthetic credentials.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import pg from "pg";
import {
  createPgIdempotencyLedger, reconcileCompletedOperation,
} from "../../../src/awcePgIdempotencyLedger.ts";

assert.equal(process.env.CI, "true");
assert.equal(process.env.AWCE_CI_ISOLATED, "true");
assert.equal(process.env.AWCE_CI_ADMIN_PASSWORD, "ci-admin-disposable");
assert.equal(process.env.AWCE_CI_RUNTIME_PASSWORD, "ci-runtime-disposable");

const { Pool } = pg;
const common = {
  host: "127.0.0.1", port: 5432, database: "awce_ci",
  connectionTimeoutMillis: 3000, max: 6,
};
const admin = new Pool({
  ...common, user: "awce_ci_admin", password: process.env.AWCE_CI_ADMIN_PASSWORD,
});
const runtime = new Pool({
  ...common, user: "awce_ci_runtime", password: process.env.AWCE_CI_RUNTIME_PASSWORD,
});
const key = randomUUID();
const req = {
  principalId: "synthetic-" + key,
  requestId: "request-" + key,
  capability: "read.synthetic",
  inputDigest: "sha256:synthetic-only",
  payload: { synthetic: true },
  allowFallback: false,
};
const proof = {
  verified: true,
  receiptId: "synthetic-receipt-" + key,
  requestId: req.requestId,
  executorId: "synthetic-executor",
  reservationId: "synthetic-reservation",
  outputDigest: "sha256:synthetic-output",
};
const ledger = createPgIdempotencyLedger(runtime);
let checks = 0;
const passed = label => {
  checks++;
  console.log(`PASS AWCE R0.6 ${checks}: ${label}`);
};
const expectCode = async (action, code) => {
  try { await action(); }
  catch (error) {
    if (error?.code === code) return;
    throw Error(`Expected PostgreSQL code ${code}, got ${error?.code}: ${error?.message}`);
  }
  throw Error(`Expected SQLSTATE ${code}, but SQL succeeded`);
};

try {
  await admin.query(readFileSync(new URL("../../../ops/migrations/awce-breaker-state-r04.sql", import.meta.url), "utf8"));
  await admin.query(readFileSync(new URL("../../../ops/migrations/awce-execution-claims-r06.sql", import.meta.url), "utf8"));
  await admin.query(
    "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'awce_ci_runtime') THEN CREATE ROLE awce_ci_runtime LOGIN PASSWORD 'ci-runtime-disposable'; END IF; END $$",
  );
  await admin.query("GRANT USAGE ON SCHEMA awce TO awce_ci_runtime");
  await admin.query("GRANT SELECT, INSERT, UPDATE ON awce.execution_claims TO awce_ci_runtime");
  assert.equal((await runtime.query("SELECT current_user AS u")).rows[0].u, "awce_ci_runtime");
  await expectCode(() => runtime.query("DELETE FROM awce.execution_claims"), "42501");
  passed("migration applied to disposable database; runtime role cannot delete");

  const competing = await Promise.all(
    Array.from({ length: 10 }, () => ledger.idempotency.claim(req)),
  );
  assert.equal(competing.filter(x => x === "ACQUIRED").length, 1);
  assert.equal(competing.filter(x => x === "DUPLICATE").length, 9);
  passed("ten concurrent claims result in exactly one acquisition");

  assert.equal((await ledger.inspect(req)).status, "NEEDS_RECONCILIATION");
  const anotherPayload = { ...req, inputDigest: "sha256:tampered" };
  assert.deepEqual(await ledger.inspect(anotherPayload), { status: "CONFLICT" });
  assert.equal(await ledger.idempotency.claim(anotherPayload), "DUPLICATE");
  passed("claimed state persists; same ID with another payload cannot be reclaimed");

  assert.equal(await ledger.idempotency.complete(req, { ...proof, verified: false }), false);
  assert.equal((await ledger.inspect(req)).status, "NEEDS_RECONCILIATION");
  passed("unverified River completion cannot transition claim");

  let lookedUp = 0;
  const absent = await reconcileCompletedOperation(req, ledger, {
    findVerifiedCompletion: async () => {
      lookedUp++;
      return null;
    },
  });
  assert.equal(absent.status, "NEEDS_RECONCILIATION");
  assert.equal(lookedUp, 1);
  passed("missing independent River evidence leaves claim locked, without retry");

  const matching = {
    verification: "VERIFIED",
    principalId: req.principalId,
    capability: req.capability,
    inputDigest: req.inputDigest,
    receipt: proof,
  };
  const completed = await reconcileCompletedOperation(req, ledger, {
    findVerifiedCompletion: async () => matching,
  });
  assert.deepEqual(completed, { status: "COMPLETED", receiptId: proof.receiptId });
  assert.equal(await ledger.idempotency.complete(req, proof), true);
  passed("verified synthetic completion persists and identical completion is idempotent");

  const modified = { ...proof, receiptId: "different" };
  assert.equal(await ledger.idempotency.complete(req, modified), false);
  assert.equal(await ledger.idempotency.claim(req), "DUPLICATE");
  passed("conflicting receipt and repeated claim cannot rewrite completion");

  await expectCode(
    () => runtime.query(
      "UPDATE awce.execution_claims SET status='CLAIMED', receipt_id=NULL WHERE principal_id=$1 AND request_id=$2",
      [req.principalId, req.requestId],
    ),
    "23514",
  );
  assert.deepEqual(await ledger.inspect(req), { status: "COMPLETED", receiptId: proof.receiptId });
  passed("PostgreSQL trigger rejects changes to completed claims");

  const secondPool = new Pool({
    ...common, user: "awce_ci_runtime", password: process.env.AWCE_CI_RUNTIME_PASSWORD,
  });
  const independentLedger = createPgIdempotencyLedger(secondPool);
  // An independent connection cannot reclaim completed work.
  try {
    assert.equal(await independentLedger.idempotency.claim(req), "DUPLICATE");
    assert.deepEqual(await independentLedger.inspect(req),
      { status: "COMPLETED", receiptId: proof.receiptId });
  } finally {
    await secondPool.end();
  }
  passed("independent connection sees persistent completion");

  console.log(`AWCE R0.6: ${checks} ephemeral PostgreSQL ledger checks passed. No Warden/River/MCP traffic.`);
} catch (error) {
  console.error("AWCE R0.6 isolated integration failed:", error);
  process.exitCode = 1;
} finally {
  await Promise.allSettled([runtime.end(), admin.end()]);
}
