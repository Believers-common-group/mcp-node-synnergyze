import { describe, it, expect } from "vitest";
import { prepareR13PostgresReservation, assessR13PostgresReservation,
 R13_RESERVE_SQL, R13_LEDGER_NAMESPACE, type R13ReservationPlan } from "./authority-reference-pg-ledger.ts";

const request=()=>({
 tenantRef:"DIGITALME-TEST-TENANT-0001",nonce:"STAGING-NONCE-000001",
 requestDigest:"sha256:"+"a".repeat(64),workerDigest:"sha256:"+"b".repeat(64),
});
type Row=Record<string,string>;
class SimulatedAtomicPgTable {
 private readonly keys=new Set<string>();
 private readonly requests=new Set<string>();
 async query(plan:R13ReservationPlan) {
  const [namespace,tenant,nonce,req,worker]=plan.parameters;
  if(plan.sql!==R13_RESERVE_SQL||namespace!==R13_LEDGER_NAMESPACE) throw Error("unapproved SQL");
  const k=namespace+"|"+tenant+"|"+nonce, r=namespace+"|"+tenant+"|"+req;
  // Simulates PostgreSQL's atomic UNIQUE/ON CONFLICT behavior, NOT a real DB test.
  if(this.keys.has(k)||this.requests.has(r))return{rowCount:0,rows:[]};
  this.keys.add(k);this.requests.add(r);
  const row:Row={ledger_namespace:namespace,tenant_digest:tenant,nonce_digest:nonce,
   request_digest:req,worker_digest:worker,state:"SPENT_OFFLINE_STAGING"};
  return{rowCount:1,rows:[row]};
 }
}

describe("R1.3 PostgreSQL staging reservation contract (NO database connection)",()=>{
 it("emits a parameterized single statement with two unique replay scopes",()=>{
  const plan=prepareR13PostgresReservation(request());
  expect(plan.namespace).toBe(R13_LEDGER_NAMESPACE);
  expect(plan.sql).toContain("INSERT INTO authority_reference_r13_nonce_ledger");
  expect(plan.sql).toContain("ON CONFLICT DO NOTHING");
  expect(plan.sql).not.toMatch(/DO UPDATE|DELETE FROM|TRUNCATE/);
  expect(plan.sql).toContain("$5");
  expect(plan.parameters).toHaveLength(5);
  expect(plan.authorized).toBe(false);
  expect(plan.executionAllowed).toBe(false);
 });
 it("hashes raw identifiers before data could reach SQL",()=>{
  const source=request(),plan=prepareR13PostgresReservation(source);
  expect(JSON.stringify(plan.parameters)).not.toContain(source.tenantRef);
  expect(JSON.stringify(plan.parameters)).not.toContain(source.nonce);
  expect(plan.tenantDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
  expect(plan.nonceDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
 });
 it("same proposal creates identical scoped immutable bindings",()=>{
  const a=prepareR13PostgresReservation(request());
  const b=prepareR13PostgresReservation(request());
  expect(a).toEqual(b);
  expect(Object.isFrozen(a.parameters)).toBe(true);
  expect(Object.isFrozen(a)).toBe(true);
 });
 it("changes in tenant or nonce change the appropriate digests",()=>{
  const a=prepareR13PostgresReservation(request());
  const b=prepareR13PostgresReservation({...request(),nonce:"STAGING-NONCE-000002"});
  const c=prepareR13PostgresReservation({...request(),tenantRef:"DIGITALME-TEST-TENANT-0002"});
  expect(b.tenantDigest).toBe(a.tenantDigest);
  expect(b.nonceDigest).not.toBe(a.nonceDigest);
  expect(c.tenantDigest).not.toBe(a.tenantDigest);
  expect(c.nonceDigest).not.toBe(a.nonceDigest);
 });
 it("rejects bad nonce, namespace injection, SQL injection and invalid digests",()=>{
  for(const item of [
   {...request(),nonce:"x"}, {...request(),tenantRef:"TENANT'; DROP TABLE entries; --"},
   {...request(),requestDigest:"a".repeat(64)}, {...request(),workerDigest:"sha256:"+"G".repeat(64)},
   {...request(),nonce:" "},{...request(),tenantRef:""},
  ]) expect(()=>prepareR13PostgresReservation(item)).toThrow("INVALID_STAGING_LEDGER_RESERVATION");
 });
 it("returns HOLD even when a correctly matching INSERT result is observed",async()=>{
  const plan=prepareR13PostgresReservation(request());
  const db=new SimulatedAtomicPgTable();
  const assessment=assessR13PostgresReservation(plan,await db.query(plan));
  expect(assessment.reason).toBe("STAGING_INSERT_OBSERVED");
  expect(assessment.stagingReservationRecorded).toBe(true);
  expect(assessment.state).toBe("HOLD");
  expect(assessment.productionPermitConsumed).toBe(false);
  expect(assessment.executionAllowed).toBe(false);
 });
 it("replays of the exact nonce are rejected by the simulated unique constraint",async()=>{
  const plan=prepareR13PostgresReservation(request()),db=new SimulatedAtomicPgTable();
  expect(assessR13PostgresReservation(plan,await db.query(plan)).stagingReservationRecorded).toBe(true);
  const outcome=assessR13PostgresReservation(plan,await db.query(plan));
  expect(outcome.reason).toBe("REPLAY_OR_REQUEST_ALREADY_SPENT");
  expect(outcome.executionAllowed).toBe(false);
 });
 it("a changed nonce with an identical request digest also conflicts",async()=>{
  const db=new SimulatedAtomicPgTable();
  const a=prepareR13PostgresReservation(request());
  const b=prepareR13PostgresReservation({...request(),nonce:"STAGING-NONCE-000002"});
  await db.query(a);
  const result=assessR13PostgresReservation(b,await db.query(b));
  expect(result.reason).toBe("REPLAY_OR_REQUEST_ALREADY_SPENT");
 });
 it("same nonce with a new request digest conflicts",async()=>{
  const db=new SimulatedAtomicPgTable();
  const a=prepareR13PostgresReservation(request());
  const b=prepareR13PostgresReservation({...request(),requestDigest:"sha256:"+"c".repeat(64)});
  await db.query(a);
  expect(assessR13PostgresReservation(b,await db.query(b)).stagingReservationRecorded).toBe(false);
 });
 it("parallel simulated workers sharing one ledger cannot both reserve",async()=>{
  const db=new SimulatedAtomicPgTable(),plan=prepareR13PostgresReservation(request());
  const result=await Promise.all(Array.from({length:10},async()=>assessR13PostgresReservation(plan,await db.query(plan))));
  expect(result.filter(v=>v.stagingReservationRecorded)).toHaveLength(1);
  expect(result.every(v=>v.executionAllowed===false)).toBe(true);
 });
 it("different tenants do not collide in shared simulated ledger",async()=>{
  const db=new SimulatedAtomicPgTable();
  const a=prepareR13PostgresReservation(request());
  const b=prepareR13PostgresReservation({...request(),tenantRef:"DIGITALME-TEST-TENANT-0002"});
  expect(assessR13PostgresReservation(a,await db.query(a)).stagingReservationRecorded).toBe(true);
  expect(assessR13PostgresReservation(b,await db.query(b)).stagingReservationRecorded).toBe(true);
 });
 it("rejects forged success rows and inconsistent counts",()=>{
  const plan=prepareR13PostgresReservation(request());
  const row={ledger_namespace:R13_LEDGER_NAMESPACE,tenant_digest:plan.tenantDigest,nonce_digest:plan.nonceDigest,
   request_digest:plan.parameters[3],worker_digest:plan.parameters[4],state:"SPENT_OFFLINE_STAGING"};
  for(const observation of [
   {rowCount:2,rows:[row]}, {rowCount:1,rows:[]}, {rowCount:null,rows:[row]},
   {rowCount:1,rows:[{...row,tenant_digest:"sha256:"+"0".repeat(64)}]},
   {rowCount:1,rows:[{...row,state:"EXECUTION_ALLOWED"}]},
  ]) expect(assessR13PostgresReservation(plan,observation).reason).toBe("UNTRUSTED_DB_RESULT");
 });
 it("database failures never grant permission",()=>{
  const plan=prepareR13PostgresReservation(request());
  const x=assessR13PostgresReservation(plan,null,true);
  expect(x.reason).toBe("STAGING_DB_FAILURE");
  expect(x.executionAllowed).toBe(false);
 });
});
