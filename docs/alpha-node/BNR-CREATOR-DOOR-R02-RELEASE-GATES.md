# BNR Creator Door R0.2 — Release Gate Register

**Change type:** Governance/contract staging, not a production deployment.

| Gate | Acceptance criterion | Current status |
| --- | --- | --- |
| G0 Local demonstrator | Python localhost app, role grants, event lifecycle, audit, preview; 10 local tests pass | LOCAL VALIDATION ONLY |
| G1 Public-safe contract | Versioned schema and Alpha Node integration notes are reviewable | SUBMITTED FOR REVIEW |
| G2 Canonical Registry | Authorized project resolved; confirmed Source membership APIs, RLS, contract checks | BLOCKED |
| G3 DigitalMe issuer | Server-side JWT/session and representation validation, revocation checks | BLOCKED |
| G4 Warden | Deny-by-default signed approval; bounded action/scope/actor/expiry; one-time consumption | BLOCKED |
| G5 Runtime | Lease-bound idempotent Neon handoff and acknowledgement; replay/collision tests | BLOCKED |
| G6 RiverOS | Independent event witness, receipt signature and separate public-key verification | BLOCKED |
| G7 VSR projection | Registry-approved public visibility and withdrawal/expiry/appeal controls | BLOCKED |
| G8 Partner + compliance | Creator rights, opt-in consent, privacy, content, settlement and external ToS | BLOCKED |
| G9 Deployment approval | Threat model, penetration review, operator acceptance and rollback plan | BLOCKED |

**Do not merge this as evidence of service connectivity.** A GitHub PR does not provision a Registry membership, grant Warden authority, establish a legal relationship with a third-party creator, or establish that any effect occurred.

## Decisions pending

1. Name the canonical BNR Source registry endpoint and contract owner.
2. Approve the DigitalMe issuer and token audience for Creator Door.
3. Identify the Warden decision verification interface and lease issuer.
4. Confirm Neon action-request schema and worker deployment authority.
5. Confirm RiverOS receipt reference and independent verification route.
6. Assign privacy/consent reviewers for creator and audience information.

Every acceptance decision should have an owner, evidence reference, review timestamp, and recorded outcome in the canonical Registry.
