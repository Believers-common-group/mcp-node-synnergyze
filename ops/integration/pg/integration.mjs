/**
 * AWCE R0.5 ephemeral database integration. CI ONLY; no live estate access.
 * Uses a disposable PostgreSQL service and synthetic Warden/River adapters.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { createPgBreakerStore } from "../../../src/awcePgBreakerStore.ts";
import {
  acquireProbe, completeProbe, closedCircuit, circuitKey,
  createCircuitHealthPort,
} from "../../../src/awceCircuitBreaker.ts";
import { routeExecution } from "../../../src/awceExecutionRouter.ts";

const { Pool } = pg;
const admin = new Pool({
  host: "127.0.0.1",
  port: 5432,
  database: "awce_ci",
  user: "awce_ci_admin",
  password: process.env.AWCE_CI_ADMIN_PASSWORD,
  connectionTimeoutMillis: 2500,
  max: 3,
});
const runtime = new Pool({
  host: "127.0.0.1",
  port: 5432,
  database: "awce_ci",
  user: "awce_ci_runtime",
  password: process.env.AWCE_CI_RUNTIME_PASSWORD,
  connectionTimeoutMillis: 2500,
  max: 6,
});
const fail = async (promise, code) => {
  try { await promise; }
  catch (error) {
    if (error?.code === code) return;
    throw new Error(`Expected PostgreSQL code ${code}, observed ${error?.code}: ${error?.message}`);
  }
  throw new Error(`Unexpected success: expected PostgreSQL code ${code}`);
};
const state = async key => {
  const result = await runtime.query(
    "SELECT state FROM awce.breaker_state WHERE circuit_key = $1", [key],
  );
  return result.rows[0]?.state;
};
const policy = { failureThreshold: 2, cooldownMs: 1000, leaseMs: 500, probeTimeoutMs: 150 };
const worker = {
  id: "synthetic-ci-worker",
  capability: "read.synthetic",
  artifactDigest: "sha256:synthetic-ci-artifact",
  transport: "stdio",
  state: "ADMITTED",
  fallbackEligible: false,
  priority: 1,
};

let checks = 0;
function ok(name) {
  checks++;
  process.stdout.write(`PASS AWCE CI ${checks}: ${name}\n`);
}

try {
  assert.equal(process.env.AWCE_CI_ISOLATED, "true", "No execution outside isolated CI");
  assert.equal(process.env.CI, "true", "This integration only runs in CI");
  assert.equal(process.env.AWCE_CI_ADMIN_PASSWORD, "ci-admin-disposable");
  assert.equal(process.env.AWCE_CI_RUNTIME_PASSWORD, "ci-runtime-disposable");

  const migration = readFileSync(
    new URL("../../../ops/migrations/awce-breaker-state-r04.sql", import.meta.url), "utf8",
  );
  await admin.query(migration);
  await admin.query(
    "DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'awce_ci_runtime') THEN CREATE ROLE awce_ci_runtime LOGIN PASSWORD 'ci-runtime-disposable'; END IF; END $$",
  );
  await admin.query("GRANT USAGE ON SCHEMA awce TO awce_ci_runtime");
  await admin.query("GRANT SELECT, INSERT, UPDATE ON awce.breaker_state TO awce_ci_runtime");
  const table = await runtime.query(
    "SELECT current_user AS who, to_regclass('awce.breaker_state') AS tbl",
  );
  assert.equal(table.rows[0].who, "awce_ci_runtime");
  assert.equal(table.rows[0].tbl, "breaker_state");
  ok("real PostgreSQL migration and restricted client admission");

  const store = createPgBreakerStore(runtime, { maxAttempts: 5 });
  const key = "awce-r05-shared:" + randomUUID();
  await Promise.all(Array.from({ length: 2 }, async () => {
    await store.transact(key, current => ({
      next: { ...current, consecutiveFailures: current.consecutiveFailures + 1 },
      value: "committed",
    }));
  }));
  const persisted = await state(key);
  assert.equal(persisted.consecutiveFailures, 2);
  const otherConnectionStore = createPgBreakerStore(runtime, { maxAttempts: 5 });
  await otherConnectionStore.transact(key, current => {
    assert.equal(current.consecutiveFailures, 2);
    return { next: closedCircuit(), value: true };
  });
  assert.deepEqual(await state(key), closedCircuit());
  ok("concurrent transactions serialize; a second client observes committed state");

  const leaseKey = "awce-r05-lease:" + randomUUID();
  const results = await Promise.all([
    store.transact(leaseKey, current => acquireProbe(current, 1000, "worker-a", policy)),
    otherConnectionStore.transact(leaseKey, current => acquireProbe(current, 1000, "worker-b", policy)),
  ]);
  assert.equal(results.filter(x => x.allowed).length, 1);
  const winner = results.find(x => x.allowed);
  const denied = results.find(x => !x.allowed);
  assert.equal(denied.reason, "HALF_OPEN_IN_FLIGHT");
  const complete = await store.transact(leaseKey, current =>
    completeProbe(current, winner, true, 1001, policy));
  assert.equal(complete.accepted, true);
  assert.equal((await state(leaseKey)).phase, "CLOSED");
  ok("concurrent worker recovery probes are fenced by durable lease");

  const unsafeKey = "awce-r05-fail-closed:" + randomUUID();
  await fail(store.transact(unsafeKey, () => {
    throw Object.assign(new Error("test rollback"), { code: "XX001" });
  }), "XX001");
  const absent = await state(unsafeKey);
  assert.equal(absent, undefined);
  await fail(runtime.query("CREATE TABLE awce.not_authorized(id integer)"), "42501");
  ok("exception rolls back state and runtime role cannot create tables");

  const injectedKey = "test' ; DROP SCHEMA awce CASCADE; --" + randomUUID();
  await store.transact(injectedKey, () => ({ next: closedCircuit(), value: true }));
  assert.deepEqual(await state(injectedKey), closedCircuit());
  assert.equal((await admin.query("SELECT to_regclass('awce.breaker_state') AS tbl")).rows[0].tbl, "awce.breaker_state");
  ok("keys are parameterized; SQL injection cannot modify schema");

  const health = createCircuitHealthPort({
    store,
    clock: { now: () => Date.now() },
    leaseIds: { next: () => randomUUID() },
    policy,
    nativeProbe: {
      // Isolated deterministic fake, never a real MCP/network operation.
      inspect: async (executor, timeoutMs) =>
        executor.id === worker.id && timeoutMs === policy.probeTimeoutMs,
    },
  });
  assert.equal(await health.probe(worker), true);
  assert.equal((await state(circuitKey(worker))).phase, "CLOSED");
  assert.equal(await health.probe({ ...worker, state: "NOT_ADMITTED" }), false);
  ok("real durable state drives health adapter; unadmitted worker stays blocked");

  const request = {
    requestId: "ci-" + randomUUID(),
    principalId: "synthetic-principal",
    capability: worker.capability,
    inputDigest: "synthetic-digest",
    payload: { synthetic: true },
    allowFallback: false,
  };
  let invoked = 0;
  const routed = await routeExecution(request, {
    inputIntegrity: { verify: async value => value.requestId === request.requestId },
    registry: { list: async capability => capability === worker.capability ? [worker] : [] },
    warden: {
      authorize: async (req, target) => ({
        decision: "ALLOW",
        signatureVerified: true,  // Synthetic stub; NOT a cryptographic signature.
        decisionId: "synthetic-allow",
        requestId: req.requestId,
        principalId: req.principalId,
        executorId: target.id,
        artifactDigest: target.artifactDigest,
        inputDigest: req.inputDigest,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }),
    },
    health,
    river: {
      reserve: async (req, target) => ({
        reservationId: "synthetic-reservation", requestId: req.requestId, executorId: target.id,
      }),
      commit: async (req, target, reservation, outputDigest) => ({
        verified: true,  // Synthetic receipt stub; NOT River-issued evidence.
        reservationId: reservation.reservationId,
        requestId: req.requestId,
        executorId: target.id,
        outputDigest,
        receiptId: "synthetic-receipt",
      }),
      recordNotStarted: async () => false,
    },
    idempotency: {
      claim: async () => "ACQUIRED", // Stub, not a durable idempotency ledger.
      complete: async () => true,
    },
    execution: {
      invoke: async () => {
        invoked++;
        return { kind: "SUCCEEDED", outputDigest: "synthetic-output" };
      },
    },
    clock: { now: () => Date.now() },
  });
  assert.equal(routed.status, "COMPLETED");
  assert.equal(invoked, 1);
  ok("router and live PostgreSQL breaker compose with explicitly synthetic Warden/River");

  process.stdout.write(`AWCE R0.5: ${checks} isolated PostgreSQL checks passed. NO live Warden/River/MCP.\n`);
} catch (error) {
  console.error("AWCE R0.5 ephemeral database integration failed:", error);
  process.exitCode = 1;
} finally {
  await Promise.allSettled([runtime.end(), admin.end()]);
}
