# BNR-DB-GATE-001 — Governed Database Gateway

Status: ADDITIVE REFERENCE / IMPLEMENTATION SLICE

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
- evidence/receipt requirements;
- deterministic success/failure states.

## Warden boundary

Preferred Cloudflare implementation is a service binding to a Warden verification Worker/service. Public bearer authentication by itself is not authorization.

The DB gateway fails closed when:

- Warden cannot be reached;
- authority is absent, expired, revoked, mismatched, or outside scope;
- the requested operation differs from the authorized operation;
- an execution lease is required but not valid;
- an idempotency collision is detected;
- the runtime database state cannot be reconciled safely.

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

## Initial implementation slice

The companion `cloudflare/db-gate` package intentionally begins with:

- edge liveness that does not touch Postgres;
- Warden service-binding verification;
- a cache-disabled `HYPERDRIVE_AUTH` binding;
- fixed read-only operational queries;
- no arbitrary SQL;
- no mutation path until execution-lease and idempotency contracts are wired end-to-end.

This keeps the first deployment non-destructive while proving the authority-to-database boundary.

## Promotion gate

Do not replace `GEN-PART-PG-BRIDGE-003` merely because the Cloudflare Worker deploys.

Promotion requires at minimum:

1. config/type validation;
2. local synthetic tests;
3. remote Worker + Hyperdrive + non-production Neon branch test;
4. Warden deny/allow/expiry/revocation tests;
5. retry/idempotency tests before any mutation is enabled;
6. evidence/receipt verification;
7. explicit Registry decision recording the new runtime role.
