# Authority Reference R2.1 — Independent Custodian Evidence Intake

**Status: HOLD / no owner appointed / no admitted reference capabilities.**

## Why R2.1, rather than duplicate R1.7
The reviewed Synnergyze source branch already contains R1.7–R2.0. The R2.0 owner register lists **13 of 13 unappointed** controls, and explicitly distinguishes source metadata and repository names from independently accepted mandates. R2.1 extends this existing register with a proposed, **side-effect-free** owner-acceptance review queue.

## Artifacts
- `modules/synnergyze/authority-reference-r21-owner-intake.ts`: accepts R2.0 owner register, an exact R1.7 candidate scope, and zero or more **untrusted** owner-mandate proposals.
- `modules/synnergyze/authority-reference-r21-owner-intake.test.ts`: negative and positive-form testing; positive means `REVIEW_REQUIRED`, never `VERIFIED`.
- `.github/workflows/authority-reference-r21-intake.yml`: focused offline testing; no network fetch, credentials, deployment, signer enrollment or mutations.
- This document is the operator review specification, not owner-appointment evidence.

Each proposal must identify a role/control, nominee, distinct reviewer, mandate reference, independently retrievable evidence locator/reference, exact R1.7 candidate digest, claimed evidence digest and a bounded issue/expiry interval. A proposal cannot override the authenticated candidate identity, issue Warden admission, or grant a BNR Door. Its evidence-reference syntax is checked but **no underlying artifact or mandate is authenticated**.

The 13-control queue returns one of `NOT_SUBMITTED`, `REVIEW_REQUIRED` or `INVALID`; `REVIEW_REQUIRED` means **unverified candidate pending independent checks**, not that an owner is accepted or that the evidence has been read. Tests reject role collisions, same reviewer and nominee, duplicate mandate/evidence references, invalid dates, malformed digests, credentials pasted into refs, unrecognized controls, stale proposals and candidate-binding mismatches.

Every result, including 13 valid-looking mandates, returns `state=HOLD`, `commissioned=false`, `executionAllowed=false`, `sourceEgressAllowed=false`, `ownerMandatesIndependentlyVerified=false`, `productionApproval=false`.

## Approval steps not performed by software
1. Separately nominate a responsible legal entity/person and identify who may review them for each required independent role.
2. Verify an independently authenticated mandate and jurisdiction/scope, outside the submitted packet and GitHub PR.
3. Pin current issuer keys, check revocation and accepted delegation, and verify live worker deployment.
4. Bind DigitalMe, BNR Door, ARK, Genesis capacity, Warden policy and River admission to the **same** request and source purpose.
5. Independently verify one-time permit use, source-specific egress and River execution evidence, then record separate go-live approval.

A single organisational actor may legitimately own some supporting functions, but the reviewer and issuer duties requiring separation **cannot be inferred independent solely from differently formatted IDs**. Changes to the formal authority matrix require their own review; the R2.1 proposal classifier does not appoint anybody.

## Test
```sh
npm ci --ignore-scripts --no-audit --no-fund
npx --no-install vitest run modules/synnergyze/authority-reference-r21-owner-intake.test.ts
npm run type-check
npm run lint
```

**No connected Supabase/Neon/Vercel changes, no GH merge, external auditor enrollment, signed production receipts, official-source retrieval, or personal device access. HOLD applies to this authority-reference proposal, not unrelated authorised development.**
