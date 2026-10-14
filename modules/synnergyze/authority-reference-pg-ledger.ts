import { createHash } from "node:crypto";

/**
 * R1.3 review-only PostgreSQL reservation plan.
 * It cannot connect to databases or execute SQL. A caller must explicitly wire
 * its plan into an independently governed staging client in a later release.
 */
export const R13_LEDGER_NAMESPACE = "AUTHORITY_REFERENCE_STAGING_R13" as const;
export const R13_RESERVE_SQL = [
  "INSERT INTO authority_reference_r13_nonce_ledger",
  "  (ledger_namespace, tenant_digest, nonce_digest, request_digest, worker_digest)",
  "VALUES ($1, $2, $3, $4, $5)",
  "ON CONFLICT DO NOTHING",
  "RETURNING ledger_namespace, tenant_digest, nonce_digest, request_digest, worker_digest, state",
].join("\n");

export type R13Digest = `sha256:${string}`;
export interface R13ReservationRequest {
  /** Caller-provided scope; only authoritative DigitalMe and Door resolution could validate it. */
  tenantRef: string;
  /** Caller-provided nonce; validation of live signer and freshness is NOT provided here. */
  nonce: string;
  requestDigest: string;
  workerDigest: string;
}
export interface R13ReservationPlan {
  schema: "AUTHORITY-REFERENCE-PG-RESERVATION-PLAN-001/R1.3";
  state: "HOLD";
  authorized: false;
  executionAllowed: false;
  namespace: typeof R13_LEDGER_NAMESPACE;
  sql: typeof R13_RESERVE_SQL;
  parameters: readonly [string,string,string,string,string];
  tenantDigest: string;
  nonceDigest: string;
}
export interface R13ReservationAssessment {
  schema: "AUTHORITY-REFERENCE-PG-RESERVATION-ASSESSMENT-001/R1.3";
  state: "HOLD";
  productionPermitConsumed: false;
  executionAllowed: false;
  stagingReservationRecorded: boolean;
  reason: "STAGING_INSERT_OBSERVED" | "REPLAY_OR_REQUEST_ALREADY_SPENT" |
          "UNTRUSTED_DB_RESULT" | "STAGING_DB_FAILURE";
}
const id=/^[A-Za-z0-9._:-]{16,160}$/;
const hash=/^sha256:[a-f0-9]{64}$/;
const digest=(s:string)=>"sha256:"+createHash("sha256").update(s).digest("hex");

/** Returns parameterized SQL; DOES NOT run a database statement or issue an execution permit. */
export function prepareR13PostgresReservation(input:R13ReservationRequest):R13ReservationPlan {
  if(!input||typeof input!=="object"||
     typeof input.tenantRef!=="string"||!id.test(input.tenantRef)||
     typeof input.nonce!=="string"||!id.test(input.nonce)||
     typeof input.requestDigest!=="string"||!hash.test(input.requestDigest)||
     typeof input.workerDigest!=="string"||!hash.test(input.workerDigest))
    throw new TypeError("INVALID_STAGING_LEDGER_RESERVATION");
  const tenantDigest=digest("R13-TENANT\0"+input.tenantRef);
  const nonceDigest=digest("R13-NONCE\0"+input.tenantRef+"\0"+input.nonce);
  const parameters=[
    R13_LEDGER_NAMESPACE,tenantDigest,nonceDigest,input.requestDigest,input.workerDigest,
  ] as [string,string,string,string,string];
  Object.freeze(parameters);
  return Object.freeze({
    schema:"AUTHORITY-REFERENCE-PG-RESERVATION-PLAN-001/R1.3",
    state:"HOLD",authorized:false,executionAllowed:false,
    namespace:R13_LEDGER_NAMESPACE,sql:R13_RESERVE_SQL,
    parameters,tenantDigest,nonceDigest,
  });
}

/**
 * Evaluate a separately observed INSERT...RETURNING result. The evaluator is not an
 * authenticated database-result verifier. A row is not an execution permission.
 * Any contradictory row, partial return or unknown count fails closed.
 */
export function assessR13PostgresReservation(
  plan:R13ReservationPlan,
  observation:{rowCount:number|null;rows:unknown[]} | null,
  databaseFailed=false,
):R13ReservationAssessment {
  const outcome=(reason:R13ReservationAssessment["reason"],recorded:boolean):R13ReservationAssessment=>
    Object.freeze({schema:"AUTHORITY-REFERENCE-PG-RESERVATION-ASSESSMENT-001/R1.3",
      state:"HOLD",productionPermitConsumed:false,executionAllowed:false,
      stagingReservationRecorded:recorded,reason});
  if(databaseFailed)return outcome("STAGING_DB_FAILURE",false);
  if(!plan||plan.schema!=="AUTHORITY-REFERENCE-PG-RESERVATION-PLAN-001/R1.3"||
     plan.namespace!==R13_LEDGER_NAMESPACE||plan.sql!==R13_RESERVE_SQL||
     plan.authorized!==false||plan.executionAllowed!==false||
     !Array.isArray(plan.parameters)||plan.parameters.length!==5||
     !observation||!Array.isArray(observation.rows))
    return outcome("UNTRUSTED_DB_RESULT",false);
  if(observation.rowCount===0&&observation.rows.length===0)
    return outcome("REPLAY_OR_REQUEST_ALREADY_SPENT",false);
  if(observation.rowCount!==1||observation.rows.length!==1)
    return outcome("UNTRUSTED_DB_RESULT",false);
  const row=observation.rows[0];
  if(!row||typeof row!=="object"||Array.isArray(row))
    return outcome("UNTRUSTED_DB_RESULT",false);
  const r=row as Record<string,unknown>;
  const names=["ledger_namespace","tenant_digest","nonce_digest","request_digest","worker_digest"];
  if(names.some((field,index)=>r[field]!==plan.parameters[index]) ||
     r.state!=="SPENT_OFFLINE_STAGING")
    return outcome("UNTRUSTED_DB_RESULT",false);
  return outcome("STAGING_INSERT_OBSERVED",true);
}
