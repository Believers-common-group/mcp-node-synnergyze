# BNR-DB-GATE-001 — Governed Database Gateway

Status: ADDITIVE REFERENCE / CONTROLLED CANARY IMPLEMENTATION

Node lineage: `ALPHA-NODE-001 -> future BNR nodes`

Runtime adapter: Cloudflare Worker + Hyperdrive + Neon Postgres

Existing verified bridge lineage: `GEN-PART-PG-BRIDGE-003` on Vercel remains valid until this adapter is independently verified and explicitly promoted.

## Purpose

`BNR-DB-GATE-001` is a narrow governed database-access adapter. It exists to prevent participant-facing applications, agents, gates, and workflows from receiving unrestricted operational database credentials.

The adapter is infrastructure. It is not an authority source and it does not replace Registry, Warden, RiverOS, Synnergyze, or SILK semantics.

## Canonical Alpha boundary

The existing `ALPHA-NODE-001` operating boundary remains authoritative:

- Supabase remains the canonical Registry/Warden plane for identity, licences, authority, consent, policy, governed request state, and execution authority.
- Neon remains the runtime/public participation, action-request, projection, and operational workload plane.
- Cloudflare Worker is an execution/gateway surface.
- Hyperdrive is database connection mediation, pooling, routing, and optional caching.
- Hyperdrive and Neon do not grant authority merely because a connection or row exists.

This file is additive and does not reclassify Neon as the canonical Registry.

## Required execution path

```text
DigitalMe / participant / system actor
        -> VSR Front Gate or governed caller
        -> Registry resolution
        -> Warden decision
        -> short-lived authority / execution lease
        -> Cloudflare Worker
        -> Hyperdrive
        -> Neon runtime operation
        -> acknowledgement
        -> Warden lease consumption / reconciliation
        -> RiverOS evidence / effect observation
        -> Registry effect/state update
```

Standing invariant:

`REQUEST != AUTHORITY != EXECUTION != DELIVERY != ACKNOWLEDGEMENT != EFFECT`

## Stable resolution questions

Before a consequential database operation the calling governance path must resolve:

1. `R1 WHO` — acting DigitalMe/entity identity.
2. `R2 HOW CONNECTED` — relationship and active context.
3. `R3 WHAT APPLIES` — authority, consent, rights, licence, policy, jurisdiction, constraints.
4. `R4 WHAT IS REQUIRED` — approvals, evidence, dependencies, provisioning, eligibility.
5. `R5 WHAT MAY HAPPEN NEXT` — the exact permissible command and effect boundary.

The Worker receives the resulting bounded authority; it does not invent these answers.

## Database connection policy

For Cloudflare Workers connecting to Neon:

- use Cloudflare Hyperdrive for the Worker-to-Postgres path;
- use a standard PostgreSQL driver such as `pg` through the Hyperdrive binding;
- create a database client inside the request handler and close it before the request completes;
- configure Hyperdrive against a direct/unpooled Neon connection, not Neon's pooled endpoint;
- never commit the Neon origin connection string to GitHub;
- never expose the Hyperdrive origin credential to participant surfaces.

Do not combine Hyperdrive with `@neondatabase/serverless` in the same connection path. The existing Vercel bridge may continue using the Neon serverless driver because it is a separate runtime lineage.

## Consistency and caching policy

Authoritative or consequential operations MUST use a Hyperdrive configuration created with caching disabled.

This includes:

- authority-sensitive reads;
- revocation and validity checks;
- execution lease state;
- idempotency and replay decisions;
- controlled writes;
- read-after-write verification;
- settlement/finality state;
- effect acknowledgement state.

A separate cache-enabled Hyperdrive binding may be introduced later only for explicitly classified rebuildable/public projections where bounded staleness is acceptable.

`CACHEABLE_PROJECTION != AUTHORITATIVE_STATE`

## Command boundary

The Worker MUST NOT accept arbitrary SQL from callers.

Every exposed operation must be a named, versioned command/query with:

- fixed SQL owned by the adapter;
- explicit input schema;
- required Warden action/scope;
- actor/context reference;
- authority reference;
- execution lease reference when consequential;
- idempotency key when mutating;
- command fingerprint bound to the authorized input;
- evidence/receipt requirements;
- deterministic success/failure states.

## Warden boundary

Preferred Cloudflare implementation is a service binding to a Warden verification Worker/service. Public bearer authentication by itself is not authorization.

The DB gateway fails closed when:

- Warden cannot be reached before a command is authorized;
- authority is absent, expired, revoked, mismatched, or outside scope;
- the requested operation differs from the authorized operation;
- an execution lease is required but not valid;
- the command fingerprint differs from the command Warden authorized;
- an idempotency collision is detected;
- the runtime database state cannot be reconciled safely.

For controlled writes, runtime acceptance and Warden lease consumption are represented separately. A post-commit Warden outage produces a recoverable `accepted_pending_authority_consumption` state; it does not fabricate rollback or effect.

## Public repository safety

Do not commit:

- Neon connection strings or passwords;
- Hyperdrive origin credentials;
- Cloudflare API tokens;
- Warden token bodies, nonces, signatures, or private keys;
- participant private data;
- private Registry rows;
- regulated evidence.

Only binding names, stable public-safe references, schemas, redacted fixtures, and deployment instructions belong in this repository.

## Implementation slices

### Slice A — governed reads

The companion `cloudflare/db-gate` package includes:

- edge liveness that does not touch Postgres;
- Warden service-binding verification;
- a cache-disabled `HYPERDRIVE_AUTH` binding;
- fixed read-only operational queries;
- no arbitrary SQL.

### Slice B — controlled mutation canary

The package now also includes one synthetic named command:

`runtime.canary.record`

This command:

- requires DigitalMe/context/authority references;
- requires an execution lease and idempotency key;
- computes a canonical SHA-256 command fingerprint;
- requires Warden to echo the exact lease and fingerprint;
- writes only to dedicated canary tables on a non-production Neon branch;
- creates command + `ACKNOWLEDGED` receipt atomically;
- rejects same-key/different-envelope replay;
- consumes Warden authority after runtime acceptance;
- preserves `pending` authority-consumption state if post-commit reconciliation is unavailable;
- never asserts `EFFECT_OBSERVED`.

Detailed contract: `BNR-DB-GATE-MUTATION-001.md`.

## Promotion gate

Do not replace `GEN-PART-PG-BRIDGE-003` merely because the Cloudflare Worker deploys or the canary mutation succeeds.

Promotion requires at minimum:

1. config/type validation;
2. focused contract tests;
3. remote Worker + cache-disabled Hyperdrive + non-production Neon branch test;
4. Warden deny/allow/expiry/revocation tests;
5. exact execution-lease and command-fingerprint validation;
6. first-write, identical replay, and idempotency-collision tests;
7. post-commit Warden outage and replay reconciliation test;
8. evidence/receipt verification with no effect fabrication;
9. least-privilege Neon role verification;
10. explicit Registry decision recording any production runtime role.

A real business mutation requires a separate named/versioned command and cannot be inferred from successful canary execution.
