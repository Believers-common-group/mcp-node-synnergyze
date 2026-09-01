# PESTEL-Friendly Legislative Intelligence R0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a test-driven Congress.gov legislative-intelligence path that retrieves one federal bill through the existing local credential boundary, normalizes its lifecycle, produces six-dimensional PESTEL signals and Registry impact candidates, preserves non-secret River evidence, creates a Synnergyze review candidate, and invokes the existing Warden request bridge only when a consequential action is proposed.

**Architecture:** Add focused `modules/legislative-intelligence/` and `modules/pestel/` domain modules to the existing `genesis` architecture. Congress.gov is a read-only source adapter; Registry matching is candidate-only; River evidence is reconstructable but non-authoritative; Synnergyze work remains non-authoritative; consequential actions are converted into the repository's existing `WardenDecisionRequestV1` through `buildWardenDecisionRequestV1`. No module created by this plan may issue authority or perform SILK settlement.

**Tech Stack:** Node.js 22.x, TypeScript 5.8 strict mode, Vitest 3.1, MSW 2.7, Zod 3.24, AJV 8.17, Node `crypto` SHA-256, native `fetch`, existing Warden/River/Synnergyze contracts.

**Spec:** `docs/superpowers/specs/2026-09-02-pestel-friendly-legislative-intelligence-r0-1-design.md`

## Global Constraints

- `Warden` alone returns `ALLOW`, `ESCALATE`, or `DENY` for consequential action.
- Congress.gov, PESTEL classification, Registry matching, UI, storage, and River evidence are advisory/evidentiary only.
- A PESTEL score never implies authority.
- Source observations and interpretations remain separate records.
- Canonical credential admission remains `CONGRESS-GOV-API-KEY-001`.
- Congress.gov API base is fixed to `https://api.congress.gov/v3`.
- Credential transport is `X-Api-Key`; an API key must never appear in a URL.
- Canonical Windows secret location is `~\.alpha\credentials\congress-gov\api-key.dpapi`.
- Plaintext credentials are prohibited in Git, source, committed YAML, logs, URLs, screenshots, issue trackers, fixtures, River evidence, and generated briefs.
- Tests use injected fake credentials and mocked HTTP only.
- Lifecycle normalization is deterministic and versioned; ambiguous source state maps to `UNKNOWN` or the least-advanced defensible state.
- Registry matches remain candidates and must never mutate stable Registry identity.
- R0.1 does not execute SILK settlement.
- No new `modules/genesis/` service is introduced because the live `genesis` branch currently has no such domain namespace; candidate mapping remains inside the legislative-intelligence domain until a Registry write contract exists.
- Follow repository style: ESM, `.ts` import suffixes, strict types, deterministic SHA-256 refs where generated.
- Every implementation task begins with a failing Vitest test and ends with targeted tests; run `npm run type-check` whenever `modules/**` types change.

---

## File Structure

Create:

```text
modules/legislative-intelligence/
  canonical.ts
  canonical.test.ts
  contracts.ts
  contracts.test.ts
  lifecycle.ts
  lifecycle.test.ts
  normalizer.ts
  normalizer.test.ts
  registry-impact.ts
  registry-impact.test.ts
  service.ts
  service.test.ts
  conformance.test.ts
  adapters/
    source-adapter.ts
    congress-gov/
      credential-provider.ts
      credential-provider.test.ts
      client.ts
      client.test.ts
      mapper.ts
      mapper.test.ts
      types.ts
      fixtures/
        bill-detail.json
        bill-actions.json
        bill-subjects.json
        bill-committees.json
        bill-amendments.json
        bill-summaries.json

modules/pestel/
  contracts.ts
  classifier.ts
  classifier.test.ts
  rules.ts
  impact-brief.ts
  impact-brief.test.ts

modules/river/
  legislative-evidence.ts
  legislative-evidence.test.ts

modules/synnergyze/
  pestel-work-bridge.ts
  pestel-work-bridge.test.ts

modules/warden/
  pestel-review-request.ts
  pestel-review-request.test.ts

schemas/pestel/
  legislative-source.schema.json
  legislative-event.schema.json
  pestel-signal.schema.json
  impact-brief.schema.json
  river-legislative-evidence.schema.json

src/tools/
  registerPestelLegislativeIngest.ts
  registerPestelLegislativeIngest.test.ts
  registerPestelImpactBrief.ts
  registerPestelImpactBrief.test.ts

docs/pestel-friendly/
  runbook.md
```

Modify:

```text
src/commands/start-server.ts
package.json
.gitignore
```

Do not modify the semantics of existing Warden, River reservation, controlled-execution, effect-verification, reconciliation, Registry bridge, or SILK modules.

---

### Task 1: Canonical Contracts, Hashing, and Schemas

**Files:**
- Create: `modules/legislative-intelligence/contracts.ts`
- Create: `modules/legislative-intelligence/canonical.ts`
- Create: `modules/legislative-intelligence/contracts.test.ts`
- Create: `modules/legislative-intelligence/canonical.test.ts`
- Create: `schemas/pestel/legislative-source.schema.json`
- Create: `schemas/pestel/legislative-event.schema.json`
- Create: `schemas/pestel/pestel-signal.schema.json`
- Create: `schemas/pestel/impact-brief.schema.json`
- Create: `schemas/pestel/river-legislative-evidence.schema.json`

**Interfaces:**
- Consumes: none.
- Produces: `LegislativeObjectRefV1`, `SourceEnvelopeV1`, `LegislativeLifecycleStateV1`, `NormalizedLegislativeEventV1`, `RelatedSourceBundleV1`, `SourceHealthV1`, `canonicalizeV1(value)`, `sha256CanonicalV1(value)`.

- [ ] **Step 1: Write the failing contract tests**

Create `modules/legislative-intelligence/contracts.test.ts` with concrete fixtures:

```ts
import { describe, expect, it } from "vitest";
import type {
  LegislativeObjectRefV1,
  NormalizedLegislativeEventV1,
  SourceEnvelopeV1,
} from "./contracts.ts";

describe("legislative intelligence contracts", () => {
  it("represents a Congress.gov bill without authority semantics", () => {
    const ref: LegislativeObjectRefV1 = {
      jurisdiction: "US-FEDERAL",
      objectType: "bill",
      congress: 119,
      billType: "hr",
      number: 6048,
    };
    const source: SourceEnvelopeV1 = {
      sourceRef: "LEG-SOURCE:abc",
      sourceSystem: "congress.gov",
      sourceObjectId: "119-hr-6048",
      sourceObjectType: "bill",
      sourcePath: "/bill/119/hr/6048",
      retrievedAt: "2026-09-02T00:00:00.000Z",
      httpStatus: 200,
      rawSha256: "a".repeat(64),
      credentialAdmissionRef: "CONGRESS-GOV-API-KEY-001",
      body: { bill: { number: "6048" } },
    };
    const event: NormalizedLegislativeEventV1 = {
      eventRef: "LEG-EVENT:def",
      sourceRefs: [source.sourceRef],
      jurisdiction: "US-FEDERAL",
      objectType: "bill",
      objectId: "119-hr-6048",
      lifecycle: "ADVANCING",
      title: "NDO Fairness Act of 2025",
      subjects: [],
      committees: [],
      actors: [],
      actionRefs: [],
      evidenceRefs: [source.sourceRef],
      normalizedAt: "2026-09-02T00:00:01.000Z",
      normalizerVersion: "LEG-NORMALIZER:R0.1",
    };
    expect(ref.number).toBe(6048);
    expect(source).not.toHaveProperty("authority");
    expect(event.lifecycle).toBe("ADVANCING");
  });
});
```

Create `modules/legislative-intelligence/canonical.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { canonicalizeV1, sha256CanonicalV1 } from "./canonical.ts";

describe("canonical legislative hashing", () => {
  it("produces the same material for object key order changes", () => {
    expect(canonicalizeV1({ b: 2, a: 1 })).toBe(canonicalizeV1({ a: 1, b: 2 }));
    expect(sha256CanonicalV1({ b: 2, a: 1 })).toBe(sha256CanonicalV1({ a: 1, b: 2 }));
  });
});
```

- [ ] **Step 2: Run tests to verify RED**

Run:

```bash
npx vitest run modules/legislative-intelligence/contracts.test.ts modules/legislative-intelligence/canonical.test.ts
```

Expected: FAIL because the files and exports do not exist.

- [ ] **Step 3: Implement the domain contracts and canonical hash**

`contracts.ts` must define exactly these lifecycle values:

```ts
export type LegislativeLifecycleStateV1 =
  | "SIGNAL"
  | "PROPOSAL"
  | "ADVANCING"
  | "ADOPTED"
  | "EFFECTIVE"
  | "ENFORCED"
  | "SUPERSEDED"
  | "WITHDRAWN"
  | "FAILED"
  | "UNKNOWN";

export interface LegislativeObjectRefV1 {
  jurisdiction: "US-FEDERAL";
  objectType: "bill";
  congress: number;
  billType: string;
  number: number;
}

export interface SourceEnvelopeV1 {
  sourceRef: string;
  sourceSystem: "congress.gov";
  sourceObjectId: string;
  sourceObjectType: "bill" | "actions" | "subjects" | "committees" | "amendments" | "summaries" | "law";
  sourcePath: string;
  retrievedAt: string;
  sourceUpdatedAt?: string;
  httpStatus: number;
  rateLimitLimit?: number;
  rateLimitRemaining?: number;
  rawSha256: string;
  credentialAdmissionRef: "CONGRESS-GOV-API-KEY-001";
  credentialFingerprintPrefix?: string;
  body: unknown;
}

export interface RelatedSourceBundleV1 {
  bill: SourceEnvelopeV1;
  actions: readonly SourceEnvelopeV1[];
  subjects: readonly SourceEnvelopeV1[];
  committees: readonly SourceEnvelopeV1[];
  amendments: readonly SourceEnvelopeV1[];
  summaries: readonly SourceEnvelopeV1[];
  law?: SourceEnvelopeV1;
}

export interface NormalizedLegislativeEventV1 {
  eventRef: string;
  sourceRefs: readonly string[];
  jurisdiction: "US-FEDERAL";
  objectType: "bill";
  objectId: string;
  lifecycle: LegislativeLifecycleStateV1;
  title?: string;
  summary?: string;
  introducedAt?: string;
  latestActionAt?: string;
  effectiveDate?: string;
  subjects: readonly string[];
  committees: readonly string[];
  actors: readonly string[];
  actionRefs: readonly string[];
  evidenceRefs: readonly string[];
  normalizedAt: string;
  normalizerVersion: "LEG-NORMALIZER:R0.1";
}

export interface SourceHealthV1 {
  sourceSystem: "congress.gov";
  ok: boolean;
  checkedAt: string;
  httpStatus?: number;
  errorCode?: string;
}
```

`canonical.ts` must recursively sort object keys while preserving array order, then hash UTF-8 JSON with SHA-256:

```ts
import { createHash } from "node:crypto";

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, normalize(child)]),
    );
  }
  return value;
}

export function canonicalizeV1(value: unknown): string {
  return JSON.stringify(normalize(value));
}

export function sha256CanonicalV1(value: unknown): string {
  return createHash("sha256").update(canonicalizeV1(value), "utf8").digest("hex");
}
```

Add Draft 2020-12 JSON schemas with `additionalProperties: false` for the canonical source/event/signal/brief/evidence shapes. Each schema must include a `schemaVersion` or fixed version identifier where applicable and must exclude any property named `apiKey`, `credentialValue`, `secret`, or `token`.

- [ ] **Step 4: Run tests and type-check**

```bash
npx vitest run modules/legislative-intelligence/contracts.test.ts modules/legislative-intelligence/canonical.test.ts
npm run type-check
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add modules/legislative-intelligence schemas/pestel
git commit -m "feat: add legislative intelligence contracts"
```

---

### Task 2: Deterministic Legislative Lifecycle Normalizer

**Files:**
- Create: `modules/legislative-intelligence/lifecycle.ts`
- Create: `modules/legislative-intelligence/lifecycle.test.ts`

**Interfaces:**
- Consumes: `LegislativeLifecycleStateV1`.
- Produces: `LifecycleEvidenceV1`, `normalizeLegislativeLifecycleV1(input): LegislativeLifecycleStateV1`.

- [ ] **Step 1: Write the failing lifecycle tests**

```ts
import { describe, expect, it } from "vitest";
import { normalizeLegislativeLifecycleV1 } from "./lifecycle.ts";

describe("normalizeLegislativeLifecycleV1", () => {
  it("does not promote an introduced bill beyond PROPOSAL", () => {
    expect(normalizeLegislativeLifecycleV1({ introduced: true, actions: [] })).toBe("PROPOSAL");
  });

  it("maps chamber passage evidence to ADVANCING", () => {
    expect(normalizeLegislativeLifecycleV1({
      introduced: true,
      actions: [{ code: "H11100", text: "Passed House" }],
    })).toBe("ADVANCING");
  });

  it("requires authoritative law evidence for ADOPTED", () => {
    expect(normalizeLegislativeLifecycleV1({
      introduced: true,
      actions: [{ text: "Presented to President" }],
      lawNumber: "Public Law 119-1",
    })).toBe("ADOPTED");
  });

  it("maps unsupported ambiguous material to UNKNOWN rather than overpromoting", () => {
    expect(normalizeLegislativeLifecycleV1({ introduced: false, actions: [{ text: "Activity" }] })).toBe("UNKNOWN");
  });
});
```

- [ ] **Step 2: Run the lifecycle test to verify RED**

```bash
npx vitest run modules/legislative-intelligence/lifecycle.test.ts
```

Expected: FAIL because `lifecycle.ts` does not exist.

- [ ] **Step 3: Implement the minimal deterministic rules**

Use this input contract:

```ts
export interface LifecycleActionEvidenceV1 {
  code?: string;
  text: string;
}

export interface LifecycleEvidenceV1 {
  introduced: boolean;
  actions: readonly LifecycleActionEvidenceV1[];
  lawNumber?: string;
  effectiveDate?: string;
  evaluatedAt?: string;
  superseded?: boolean;
  withdrawn?: boolean;
  failed?: boolean;
  enforcementEvidence?: boolean;
}
```

Rule order must be highest-specificity first:

```text
superseded -> SUPERSEDED
withdrawn -> WITHDRAWN
failed -> FAILED
enforcementEvidence -> ENFORCED
lawNumber + effectiveDate <= evaluatedAt -> EFFECTIVE
lawNumber -> ADOPTED
recognized advancing action -> ADVANCING
introduced -> PROPOSAL
otherwise -> UNKNOWN
```

Recognized advancing evidence is limited to normalized action codes/text that clearly establishes committee reporting, chamber passage, cloture/consideration, conference, enrollment, or presentation to the President. Do not infer `ADOPTED` from presentation, enrollment, or passage alone.

- [ ] **Step 4: Run targeted tests and type-check**

```bash
npx vitest run modules/legislative-intelligence/lifecycle.test.ts
npm run type-check
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add modules/legislative-intelligence/lifecycle.ts modules/legislative-intelligence/lifecycle.test.ts
git commit -m "feat: add deterministic legislative lifecycle"
```

---

### Task 3: Congress.gov Credential Boundary and HTTP Client

**Files:**
- Create: `modules/legislative-intelligence/adapters/source-adapter.ts`
- Create: `modules/legislative-intelligence/adapters/congress-gov/types.ts`
- Create: `modules/legislative-intelligence/adapters/congress-gov/credential-provider.ts`
- Create: `modules/legislative-intelligence/adapters/congress-gov/credential-provider.test.ts`
- Create: `modules/legislative-intelligence/adapters/congress-gov/client.ts`
- Create: `modules/legislative-intelligence/adapters/congress-gov/client.test.ts`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `LegislativeObjectRefV1`, `SourceEnvelopeV1`, `RelatedSourceBundleV1`, `SourceHealthV1`, `sha256CanonicalV1`.
- Produces: `CongressGovCredentialProviderV1`, `StaticCongressGovCredentialProviderV1`, `WindowsDpapiCongressGovCredentialProviderV1`, `CongressGovClientV1`, `LegislativeSourceAdapterV1`.

- [ ] **Step 1: Write credential-provider red tests**

The test must prove callers receive only the credential value at the execution boundary and metadata remains non-secret:

```ts
import { describe, expect, it } from "vitest";
import { StaticCongressGovCredentialProviderV1 } from "./credential-provider.ts";

describe("Congress.gov credential provider", () => {
  it("separates secret value from admissible metadata", async () => {
    const provider = new StaticCongressGovCredentialProviderV1("sentinel-secret", {
      admissionRef: "CONGRESS-GOV-API-KEY-001",
      fingerprintPrefix: "abc123",
    });
    expect(await provider.getCredential()).toBe("sentinel-secret");
    expect(JSON.stringify(provider.metadata())).not.toContain("sentinel-secret");
  });
});
```

- [ ] **Step 2: Write HTTP client red tests with MSW**

Use MSW v2 and assert the key is in `X-Api-Key`, never the URL:

```ts
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { CongressGovClientV1 } from "./client.ts";
import { StaticCongressGovCredentialProviderV1 } from "./credential-provider.ts";

let observedUrl = "";
let observedHeader = "";
const server = setupServer(
  http.get("https://api.congress.gov/v3/bill/119/hr/6048", ({ request }) => {
    observedUrl = request.url;
    observedHeader = request.headers.get("x-api-key") ?? "";
    return HttpResponse.json({ bill: { congress: 119, type: "HR", number: "6048", title: "NDO Fairness Act of 2025" } });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("CongressGovClientV1", () => {
  it("injects credential only in X-Api-Key", async () => {
    const provider = new StaticCongressGovCredentialProviderV1("sentinel-secret", {
      admissionRef: "CONGRESS-GOV-API-KEY-001",
      fingerprintPrefix: "abc123",
    });
    const client = new CongressGovClientV1(provider, () => "2026-09-02T00:00:00.000Z");
    const result = await client.getJson("/bill/119/hr/6048", "bill", "119-hr-6048");
    expect(observedHeader).toBe("sentinel-secret");
    expect(observedUrl).not.toContain("sentinel-secret");
    expect(JSON.stringify(result)).not.toContain("sentinel-secret");
  });
});
```

- [ ] **Step 3: Run tests to verify RED**

```bash
npx vitest run modules/legislative-intelligence/adapters/congress-gov/credential-provider.test.ts modules/legislative-intelligence/adapters/congress-gov/client.test.ts
```

Expected: FAIL because the adapter files do not exist.

- [ ] **Step 4: Implement the credential provider contract**

Use:

```ts
export interface CongressGovCredentialMetadataV1 {
  admissionRef: "CONGRESS-GOV-API-KEY-001";
  fingerprintPrefix?: string;
}

export interface CongressGovCredentialProviderV1 {
  getCredential(): Promise<string>;
  metadata(): CongressGovCredentialMetadataV1;
}
```

`StaticCongressGovCredentialProviderV1` is test-only/runtime-injection friendly.

`WindowsDpapiCongressGovCredentialProviderV1` must default to `~\.alpha\credentials\congress-gov\api-key.dpapi`. It must support both common admission encodings without writing plaintext to disk:

1. UTF-8 DPAPI text produced by PowerShell `ConvertFrom-SecureString`: invoke PowerShell with the file path as an argument, call `ConvertTo-SecureString`, marshal to plaintext inside that child process, emit only the plaintext to the parent process, then clear local variables before process exit.
2. Binary bytes produced by `.NET ProtectedData.Protect`: invoke PowerShell to read bytes and call `ProtectedData.Unprotect(..., CurrentUser)`, decode UTF-8 in memory, emit only plaintext to the parent process.

The provider must reject missing/empty files and non-Windows hosts with explicit non-secret error codes: `CREDENTIAL_FILE_MISSING`, `CREDENTIAL_FILE_EMPTY`, `CREDENTIAL_DECRYPT_FAILED`, `CREDENTIAL_PLATFORM_UNSUPPORTED`.

Do not log child stdout/stderr. Do not include file bytes or plaintext in thrown errors.

- [ ] **Step 5: Implement the Congress.gov HTTP client**

`getJson(path, sourceObjectType, sourceObjectId)` must:

```text
1. reject paths not beginning with `/`;
2. join them to the fixed base `https://api.congress.gov/v3`;
3. reject any URL containing `api_key` or `apikey` query parameters;
4. retrieve the secret immediately before fetch;
5. set `X-Api-Key` only on the outbound request;
6. capture HTTP status and `x-ratelimit-*` headers;
7. parse JSON only on successful 2xx responses;
8. throw a non-secret `CongressGovHttpErrorV1` for 401/403/404/429/5xx;
9. build `SourceEnvelopeV1` with SHA-256 of the parsed body and credential admission metadata only.
```

Add `.alpha/credentials/`, `*.dpapi`, and `*.secret` to `.gitignore`; keep existing `.env` exclusions.

- [ ] **Step 6: Run adapter tests and type-check**

```bash
npx vitest run modules/legislative-intelligence/adapters/congress-gov/credential-provider.test.ts modules/legislative-intelligence/adapters/congress-gov/client.test.ts
npm run type-check
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add modules/legislative-intelligence/adapters .gitignore
git commit -m "feat: add governed Congress.gov source client"
```

---

### Task 4: Congress.gov Mapper and Source Normalizer

**Files:**
- Create: `modules/legislative-intelligence/adapters/congress-gov/mapper.ts`
- Create: `modules/legislative-intelligence/adapters/congress-gov/mapper.test.ts`
- Create: `modules/legislative-intelligence/normalizer.ts`
- Create: `modules/legislative-intelligence/normalizer.test.ts`
- Create: six fixture JSON files under `modules/legislative-intelligence/adapters/congress-gov/fixtures/`

**Interfaces:**
- Consumes: `CongressGovClientV1`, `RelatedSourceBundleV1`, lifecycle normalizer, canonical hashing.
- Produces: `CongressGovSourceAdapterV1`, `normalizeCongressGovBillV1(bundle, normalizedAt): NormalizedLegislativeEventV1`.

- [ ] **Step 1: Add minimal Congress.gov fixture payloads**

Fixture data must be synthetic-but-shape-compatible and contain no credential values. Use bill `119/hr/6048` consistently.

`bill-detail.json`:

```json
{
  "bill": {
    "congress": 119,
    "type": "HR",
    "number": "6048",
    "title": "NDO Fairness Act of 2025",
    "introducedDate": "2025-11-03",
    "latestAction": { "actionDate": "2026-08-31", "text": "Passed House" }
  }
}
```

`bill-actions.json` must contain at least introduction and House-passage action objects. `bill-subjects.json` must contain `Constitutional rights`, `Electronic communications`, and `Law enforcement`. `bill-committees.json` must contain one committee name. `bill-amendments.json` may contain an empty amendments array. `bill-summaries.json` must contain one short synthetic summary explicitly labelled fixture text.

- [ ] **Step 2: Write mapper and normalizer red tests**

Test exact de-duplication, stable sorting, lifecycle `ADVANCING`, and deterministic event refs:

```ts
it("normalizes the same source bundle deterministically", () => {
  const first = normalizeCongressGovBillV1(bundle, "2026-09-02T00:00:00.000Z");
  const second = normalizeCongressGovBillV1(bundle, "2026-09-02T00:00:00.000Z");
  expect(first.eventRef).toBe(second.eventRef);
  expect(first.lifecycle).toBe("ADVANCING");
  expect(first.subjects).toEqual([...first.subjects].sort());
});
```

- [ ] **Step 3: Run tests to verify RED**

```bash
npx vitest run modules/legislative-intelligence/adapters/congress-gov/mapper.test.ts modules/legislative-intelligence/normalizer.test.ts
```

Expected: FAIL because mapper/normalizer do not exist.

- [ ] **Step 4: Implement `CongressGovSourceAdapterV1`**

The adapter must call these paths:

```text
/bill/{congress}/{billType}/{number}
/bill/{congress}/{billType}/{number}/actions
/bill/{congress}/{billType}/{number}/subjects
/bill/{congress}/{billType}/{number}/committees
/bill/{congress}/{billType}/{number}/amendments
/bill/{congress}/{billType}/{number}/summaries
```

Implement explicit pagination by following API `pagination.next` only when it resolves under `https://api.congress.gov/v3`; strip any query credential if a fixture accidentally includes one and reject the response instead of following it. `getRelated()` returns all six categories as `SourceEnvelopeV1` collections.

- [ ] **Step 5: Implement `normalizeCongressGovBillV1`**

Normalization must:

```text
1. validate bill identity across all source envelopes;
2. preserve source refs separately from interpretations;
3. derive `LifecycleEvidenceV1` from action/law material;
4. sort/dedupe subjects, committees, actors, action refs, evidence refs;
5. compute eventRef from canonical material excluding normalizedAt;
6. include normalizedAt as observation metadata only;
7. set normalizerVersion exactly `LEG-NORMALIZER:R0.1`.
```

The event identity material must include jurisdiction, object ID, lifecycle, title, summary, dates, normalized subjects/committees/actors, action refs, and source body hashes; it must not include retrieved time or credentials.

- [ ] **Step 6: Run mapper/normalizer tests and type-check**

```bash
npx vitest run modules/legislative-intelligence/adapters/congress-gov/mapper.test.ts modules/legislative-intelligence/normalizer.test.ts
npm run type-check
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add modules/legislative-intelligence/adapters/congress-gov modules/legislative-intelligence/normalizer.ts modules/legislative-intelligence/normalizer.test.ts
git commit -m "feat: normalize Congress.gov bill lifecycle"
```

---

### Task 5: Six-Dimensional PESTEL Classifier and Impact Brief

**Files:**
- Create: `modules/pestel/contracts.ts`
- Create: `modules/pestel/rules.ts`
- Create: `modules/pestel/classifier.ts`
- Create: `modules/pestel/classifier.test.ts`
- Create: `modules/pestel/impact-brief.ts`
- Create: `modules/pestel/impact-brief.test.ts`

**Interfaces:**
- Consumes: `NormalizedLegislativeEventV1`, canonical hashing.
- Produces: `PestelSignalV1`, `PestelClassifierAssistV1`, `classifyPestelV1`, `ImpactBriefV1`, `buildImpactBriefV1`.

- [ ] **Step 1: Write classifier red tests**

```ts
it("emits all six bounded dimensions with evidence-backed rationale", async () => {
  const signal = await classifyPestelV1(event, { classifierVersion: "PESTEL:R0.1" });
  for (const score of Object.values(signal.vector)) {
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  }
  expect(Object.keys(signal.vector).sort()).toEqual(
    ["economic", "environmental", "legal", "political", "social", "technological"],
  );
  expect(signal.rationale.length).toBeGreaterThan(0);
  expect(signal.evidenceRefs.length).toBeGreaterThan(0);
});

it("does not mark a mere proposal as a legal obligation", async () => {
  const signal = await classifyPestelV1({ ...event, lifecycle: "PROPOSAL" }, { classifierVersion: "PESTEL:R0.1" });
  expect(signal.obligationCandidate).toBe(false);
});
```

- [ ] **Step 2: Run tests to verify RED**

```bash
npx vitest run modules/pestel/classifier.test.ts modules/pestel/impact-brief.test.ts
```

Expected: FAIL because PESTEL files do not exist.

- [ ] **Step 3: Implement PESTEL contracts and deterministic rule stage**

Define:

```ts
export type PestelDimensionV1 =
  | "political"
  | "economic"
  | "social"
  | "technological"
  | "environmental"
  | "legal";

export interface PestelRationaleV1 {
  dimension: PestelDimensionV1;
  scoreContribution: number;
  basis: "DETERMINISTIC_RULE" | "MODEL_ASSIST";
  statement: string;
  evidenceRefs: readonly string[];
  hypothesis: boolean;
}

export interface PestelSignalV1 {
  signalRef: string;
  legislativeEventRef: string;
  vector: Record<PestelDimensionV1, number>;
  riskScore: number;
  opportunityScore: number;
  obligationCandidate: boolean;
  confidence: number;
  rationale: readonly PestelRationaleV1[];
  classifierVersion: string;
  evidenceRefs: readonly string[];
}
```

`rules.ts` must contain explicit keyword/subject mappings for tax, subsidy, trade, labour, reporting, technology, privacy/data, environment, health/safety, infrastructure, enforcement, courts, and public administration. Scores accumulate and clamp to `[0,1]`.

- [ ] **Step 4: Add the model-assist contract without adding a provider dependency**

```ts
export interface PestelClassifierAssistV1 {
  classify(event: NormalizedLegislativeEventV1): Promise<{
    vector: Partial<Record<PestelDimensionV1, number>>;
    rationale: readonly PestelRationaleV1[];
    confidence: number;
  }>;
}
```

`classifyPestelV1` accepts optional `assist`. If absent, deterministic classification still produces all six dimensions and caps confidence at `0.75`. If present, merge scores by arithmetic mean per supplied dimension, validate every score, require model rationale to reference existing event evidence refs, and reject unexplained values.

`obligationCandidate` may be true only for `ADOPTED`, `EFFECTIVE`, or `ENFORCED` and only when the rules detect obligation/enforcement language.

- [ ] **Step 5: Implement `buildImpactBriefV1`**

The brief must separate observations from hypotheses:

```ts
export interface ImpactBriefV1 {
  briefRef: string;
  signalRef: string;
  lifecycle: string;
  observedFacts: readonly string[];
  riskHypotheses: readonly string[];
  opportunityHypotheses: readonly string[];
  obligationCandidate: boolean;
  completeness: "COMPLETE" | "DEGRADED";
  confidence: number;
  evidenceRefs: readonly string[];
  createdAt: string;
}
```

No brief sentence may claim a proposal is law. Prefix inferred consequences in stored material with `Hypothesis:`.

- [ ] **Step 6: Run PESTEL tests and type-check**

```bash
npx vitest run modules/pestel
npm run type-check
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add modules/pestel
git commit -m "feat: add evidence-backed PESTEL classification"
```

---

### Task 6: Registry Impact Candidates and River Legislative Evidence

**Files:**
- Create: `modules/legislative-intelligence/registry-impact.ts`
- Create: `modules/legislative-intelligence/registry-impact.test.ts`
- Create: `modules/river/legislative-evidence.ts`
- Create: `modules/river/legislative-evidence.test.ts`

**Interfaces:**
- Consumes: `PestelSignalV1`, `NormalizedLegislativeEventV1`, `ImpactBriefV1`, source envelopes, canonical hash.
- Produces: `RegistrySubjectIndexEntryV1`, `RegistryImpactCandidateV1`, `mapRegistryImpactCandidatesV1`, `LegislativeEvidenceReceiptV1`, `buildLegislativeEvidenceReceiptV1`.

- [ ] **Step 1: Write Registry candidate red tests**

```ts
it("returns relational candidates without mutating Registry identities", () => {
  const candidates = mapRegistryImpactCandidatesV1(signal, [
    { registryEntityRef: "SECTOR:ELECTRONIC-COMMUNICATIONS", terms: ["electronic communications", "privacy"] },
  ]);
  expect(candidates[0]).toMatchObject({
    registryEntityRef: "SECTOR:ELECTRONIC-COMMUNICATIONS",
    relation: "MAY_AFFECT",
  });
  expect(candidates[0].confidence).toBeLessThanOrEqual(1);
});
```

- [ ] **Step 2: Write River evidence red tests including secret leakage**

```ts
it("preserves replay metadata without secret material", () => {
  const receipt = buildLegislativeEvidenceReceiptV1({
    runRef: "PESTEL-RUN:001",
    sources,
    event,
    signal,
    brief,
    observedAt: "2026-09-02T00:00:00.000Z",
  });
  const material = JSON.stringify(receipt);
  expect(material).not.toContain("sentinel-secret");
  expect(receipt.credentialAdmissionRef).toBe("CONGRESS-GOV-API-KEY-001");
  expect(receipt.rawSourceDigests.length).toBeGreaterThan(0);
});
```

- [ ] **Step 3: Run tests to verify RED**

```bash
npx vitest run modules/legislative-intelligence/registry-impact.test.ts modules/river/legislative-evidence.test.ts
```

Expected: FAIL because the modules do not exist.

- [ ] **Step 4: Implement candidate mapping**

Define:

```ts
export interface RegistrySubjectIndexEntryV1 {
  registryEntityRef: string;
  terms: readonly string[];
}

export interface RegistryImpactCandidateV1 {
  candidateRef: string;
  signalRef: string;
  registryEntityRef: string;
  relation: "AFFECTS" | "MAY_AFFECT" | "REGULATES" | "INCENTIVIZES" | "RESTRICTS";
  confidence: number;
  matchedTerms: readonly string[];
  evidenceRefs: readonly string[];
}
```

R0.1 uses token-normalized term intersection only. Default relation is `MAY_AFFECT`. `REGULATES`, `INCENTIVIZES`, or `RESTRICTS` may be emitted only when corresponding deterministic PESTEL rule evidence exists. A candidate object has no mutation method and no Registry write adapter.

- [ ] **Step 5: Implement River evidence builder**

The receipt must include:

```ts
export interface LegislativeEvidenceReceiptV1 {
  evidenceRef: string;
  runRef: string;
  sourceSystem: "congress.gov";
  sourceObjectIds: readonly string[];
  credentialAdmissionRef: "CONGRESS-GOV-API-KEY-001";
  credentialFingerprintPrefix?: string;
  requestStatuses: readonly number[];
  rateLimitObservations: readonly { limit?: number; remaining?: number }[];
  rawSourceDigests: readonly string[];
  normalizedEventDigest: string;
  lifecycleNormalizerVersion: "LEG-NORMALIZER:R0.1";
  classifierVersion: string;
  mappingPolicyVersion: "REGISTRY-IMPACT:R0.1";
  outputBriefDigest: string;
  observedAt: string;
  persistenceState: "LOCAL_DOMAIN_RECEIPT";
}
```

The evidence ref is a deterministic SHA-256 ref over all substantive material except `observedAt`. Never serialize `SourceEnvelopeV1.body` into the receipt; store only source identities and hashes.

- [ ] **Step 6: Run tests and type-check**

```bash
npx vitest run modules/legislative-intelligence/registry-impact.test.ts modules/river/legislative-evidence.test.ts
npm run type-check
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add modules/legislative-intelligence/registry-impact.ts modules/legislative-intelligence/registry-impact.test.ts modules/river/legislative-evidence.ts modules/river/legislative-evidence.test.ts
git commit -m "feat: add Registry impact and River evidence receipts"
```

---

### Task 7: Synnergyze Review Candidate and End-to-End Ingestion Service

**Files:**
- Create: `modules/synnergyze/pestel-work-bridge.ts`
- Create: `modules/synnergyze/pestel-work-bridge.test.ts`
- Create: `modules/legislative-intelligence/service.ts`
- Create: `modules/legislative-intelligence/service.test.ts`

**Interfaces:**
- Consumes: source adapter, normalizer, classifier, Registry candidate mapper, River evidence builder, impact brief.
- Produces: `PestelReviewWorkCandidateV1`, `buildPestelReviewWorkCandidateV1`, `LegislativeIntelligenceServiceV1.ingestBill()`.

- [ ] **Step 1: Write Synnergyze work-candidate red test**

```ts
it("creates a non-authoritative review candidate", () => {
  const work = buildPestelReviewWorkCandidateV1({ event, signal, brief, registryCandidates });
  expect(work.state).toBe("REVIEW_CANDIDATE");
  expect(work.authorized).toBe(false);
  expect(work).not.toHaveProperty("actionToken");
});
```

- [ ] **Step 2: Write ingestion-service red test**

Use a fake `LegislativeSourceAdapterV1` returning fixture envelopes. Assert one call produces normalized event, signal, Registry candidates, evidence receipt, brief, and work candidate with no Warden decision.

```ts
const result = await service.ingestBill(ref, {
  observedAt: "2026-09-02T00:00:00.000Z",
  registryIndex,
});
expect(result.event.lifecycle).toBe("ADVANCING");
expect(result.signal.legislativeEventRef).toBe(result.event.eventRef);
expect(result.workCandidate.authorized).toBe(false);
expect(result).not.toHaveProperty("wardenDecision");
```

- [ ] **Step 3: Run tests to verify RED**

```bash
npx vitest run modules/synnergyze/pestel-work-bridge.test.ts modules/legislative-intelligence/service.test.ts
```

Expected: FAIL because the files do not exist.

- [ ] **Step 4: Implement the Synnergyze candidate contract**

```ts
export interface PestelReviewWorkCandidateV1 {
  workRef: string;
  sourceEventRef: string;
  signalRef: string;
  briefRef: string;
  registryCandidateRefs: readonly string[];
  state: "REVIEW_CANDIDATE";
  authorized: false;
  evidenceRefs: readonly string[];
  correlationId: string;
}
```

The builder generates deterministic `workRef` and `correlationId` from event/signal/brief identities. It never returns a Warden token or execution grant.

- [ ] **Step 5: Implement `LegislativeIntelligenceServiceV1`**

Constructor dependencies:

```ts
constructor(
  private readonly source: LegislativeSourceAdapterV1,
  private readonly classifierAssist?: PestelClassifierAssistV1,
) {}
```

`ingestBill(ref, options)` exact pipeline:

```text
source.getRelated(ref)
-> normalizeCongressGovBillV1
-> classifyPestelV1
-> buildImpactBriefV1
-> mapRegistryImpactCandidatesV1
-> buildLegislativeEvidenceReceiptV1
-> buildPestelReviewWorkCandidateV1
-> return immutable result
```

Any source, parse, lifecycle, evidence, or classification failure terminates the run with a non-secret error. Registry match uncertainty yields an empty candidate list, not failure.

- [ ] **Step 6: Run service tests and type-check**

```bash
npx vitest run modules/synnergyze/pestel-work-bridge.test.ts modules/legislative-intelligence/service.test.ts
npm run type-check
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add modules/synnergyze/pestel-work-bridge.ts modules/synnergyze/pestel-work-bridge.test.ts modules/legislative-intelligence/service.ts modules/legislative-intelligence/service.test.ts
git commit -m "feat: add PESTEL legislative review workflow"
```

---

### Task 8: Consequential-Action Warden Request Bridge

**Files:**
- Create: `modules/warden/pestel-review-request.ts`
- Create: `modules/warden/pestel-review-request.test.ts`

**Interfaces:**
- Consumes: `PestelReviewWorkCandidateV1`, `ResolvedRepresentationContextV1`, existing `SynnergyzeProgramDraftV1`, `SynnergyzeEventDraftV1`, and `buildWardenDecisionRequestV1` from `modules/synnergyze/warden-request-bridge.ts`.
- Produces: `PestelConsequentialActionProposalV1`, `buildPestelConsequentialWardenRequestV1`.

- [ ] **Step 1: Write the red tests**

Test that read-only review does not require Warden and consequential action does:

```ts
it("requires an explicit caller proposal before a Warden request exists", () => {
  expect(() => buildPestelConsequentialWardenRequestV1({
    workCandidate,
    proposal: undefined as never,
    representation,
    requestedAt: "2026-09-02T00:00:00.000Z",
  })).toThrow();
});

it("uses the existing Synnergyze Warden bridge for consequential action", () => {
  const result = buildPestelConsequentialWardenRequestV1({
    workCandidate,
    proposal: {
      proposalRef: "PESTEL-ACTION:001",
      action: "notification.send",
      capabilityRef: "external_notification.send",
      targetRef: "WORKSPACE:LEGAL-REVIEW",
      requestedEffect: "Send an evidence-backed legislative alert outside the bounded workspace",
      evidenceRefs: [evidence.evidenceRef],
    },
    representation,
    requestedAt: "2026-09-02T00:00:00.000Z",
  });
  expect(result.ok).toBe(true);
  if (result.ok) expect(result.request.capabilityRef).toBe("external_notification.send");
});
```

- [ ] **Step 2: Run test to verify RED**

```bash
npx vitest run modules/warden/pestel-review-request.test.ts
```

Expected: FAIL because the bridge does not exist.

- [ ] **Step 3: Implement the proposal contract**

```ts
export interface PestelConsequentialActionProposalV1 {
  proposalRef: string;
  action: string;
  capabilityRef: string;
  targetRef: string;
  requestedEffect: string;
  evidenceRefs: readonly string[];
}
```

`buildPestelConsequentialWardenRequestV1` must construct a synthetic non-authoritative Synnergyze program/event pair with:

```text
state = READY_FOR_AUTHORIZATION (program)
authorized = false
state = DRAFT (event)
authorized = false
sourcePlanRef = workCandidate.workRef
sourceIntentRef = proposal.proposalRef
sourceExpressionRef = workCandidate.briefRef
capabilityRef/targetRef/action exactly from caller proposal
correlationId exactly from workCandidate
```

Then call the existing `buildWardenDecisionRequestV1`; do not duplicate Warden request construction.

The representation object remains external input and must carry authority/policy refs; PESTEL evidence itself must not be inserted into `authorityRefs`.

- [ ] **Step 4: Run Warden bridge tests plus existing Warden request regression**

```bash
npx vitest run modules/warden/pestel-review-request.test.ts modules/synnergyze/warden-request-bridge.test.ts
npm run type-check
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add modules/warden/pestel-review-request.ts modules/warden/pestel-review-request.test.ts
git commit -m "feat: route PESTEL actions through Warden bridge"
```

---

### Task 9: Bounded MCP Tools and Server Registration

**Files:**
- Create: `src/tools/registerPestelLegislativeIngest.ts`
- Create: `src/tools/registerPestelLegislativeIngest.test.ts`
- Create: `src/tools/registerPestelImpactBrief.ts`
- Create: `src/tools/registerPestelImpactBrief.test.ts`
- Modify: `src/commands/start-server.ts`

**Interfaces:**
- Consumes: `LegislativeIntelligenceServiceV1`, Congress.gov credential provider, `CustomMcpServer`, `ToolFilter`.
- Produces MCP operation IDs `pestelLegislativeIngest` and `pestelImpactBrief`.

- [ ] **Step 1: Write MCP registration red tests**

Use the existing Warden conformance tool registration pattern. Assert:

```text
- tool not registered unless `VSR_PESTEL_MCP_R0_1=1`;
- tool not registered unless explicitly present in `--allow-tools`;
- `all` does not implicitly expose it;
- input schema has no apiKey/secret/credentialValue fields;
- output serialization contains no secret sentinel value;
- annotations mark tools read-only.
```

- [ ] **Step 2: Run MCP tests to verify RED**

```bash
npx vitest run src/tools/registerPestelLegislativeIngest.test.ts src/tools/registerPestelImpactBrief.test.ts
```

Expected: FAIL because registration files do not exist.

- [ ] **Step 3: Implement `pestelLegislativeIngest`**

Input schema:

```ts
const inputSchema = z.object({
  congress: z.number().int().positive(),
  billType: z.string().min(1).max(12),
  number: z.number().int().positive(),
  registryIndex: z.array(z.object({
    registryEntityRef: z.string().min(1),
    terms: z.array(z.string().min(1)),
  })).default([]),
}).strict();
```

Output must contain source receipt refs, normalized event, PESTEL signal, impact brief, Registry candidate refs, River evidence receipt, and Synnergyze review candidate. It must not accept or return credentials.

Runtime provider is `WindowsDpapiCongressGovCredentialProviderV1`; tests inject `StaticCongressGovCredentialProviderV1` through a factory parameter so CI never touches local secret storage.

- [ ] **Step 4: Implement `pestelImpactBrief`**

For R0.1, make it a pure builder tool that accepts a normalized event plus a PESTEL signal payload conforming to internal schemas and returns `buildImpactBriefV1` output. It does not perform a new network request and does not trigger Warden.

- [ ] **Step 5: Add dual opt-in registration**

Both tools use environment variable:

```text
VSR_PESTEL_MCP_R0_1=1
```

Registration function logic must match the restrictive pattern used by `maybeRegisterWardenConformanceDecision`:

```ts
if (env[enableEnvironmentVariable] !== "1") return false;
if (!filter.allowedTools?.has(operationId)) return false;
if (!isToolAllowed(operationId, filter)) return false;
```

Import and call both registration helpers from `createServer()` in `src/commands/start-server.ts` before generic OpenAPI tool registration.

- [ ] **Step 6: Run MCP tests and existing start-server regressions**

```bash
npx vitest run src/tools/registerPestelLegislativeIngest.test.ts src/tools/registerPestelImpactBrief.test.ts src/commands/start-server.warden.test.ts src/commands/start-server.river.test.ts src/commands/start-server.synnergyze.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/tools/registerPestelLegislativeIngest.ts src/tools/registerPestelLegislativeIngest.test.ts src/tools/registerPestelImpactBrief.ts src/tools/registerPestelImpactBrief.test.ts src/commands/start-server.ts
git commit -m "feat: expose bounded PESTEL legislative MCP tools"
```

---

### Task 10: Conformance, Secret-Leak Guard, Package Scripts, and Runbook

**Files:**
- Create: `modules/legislative-intelligence/conformance.test.ts`
- Create: `docs/pestel-friendly/runbook.md`
- Modify: `package.json`

**Interfaces:**
- Consumes: complete R0.1 pipeline.
- Produces: deterministic conformance proof and operator commands.

- [ ] **Step 1: Write the end-to-end conformance test**

The test must run the same fixture bundle twice and assert identical event/signal/brief/evidence/work refs when all version strings and substantive inputs are unchanged:

```ts
it("replays deterministically without leaking credential material", async () => {
  const first = await service.ingestBill(ref, options);
  const second = await service.ingestBill(ref, options);
  expect(first.event.eventRef).toBe(second.event.eventRef);
  expect(first.signal.signalRef).toBe(second.signal.signalRef);
  expect(first.brief.briefRef).toBe(second.brief.briefRef);
  expect(first.evidence.evidenceRef).toBe(second.evidence.evidenceRef);
  expect(first.workCandidate.workRef).toBe(second.workCandidate.workRef);
  const serialized = JSON.stringify([first, second]);
  expect(serialized).not.toContain("sentinel-secret");
});
```

Add a second test that recursively walks all returned objects and fails if a key name matches `/api.?key|secret|credential.?value|authorization.?token/i`.

- [ ] **Step 2: Run conformance test to verify its initial state**

```bash
npx vitest run modules/legislative-intelligence/conformance.test.ts
```

Expected: PASS only after Tasks 1-9 are complete; if it fails, fix the owning module rather than weakening the assertions.

- [ ] **Step 3: Add package scripts**

Merge these into the current `scripts` object without deleting existing scripts:

```json
{
  "test:pestel": "vitest run modules/pestel modules/legislative-intelligence modules/river/legislative-evidence.test.ts modules/synnergyze/pestel-work-bridge.test.ts modules/warden/pestel-review-request.test.ts",
  "test:pestel:congress": "vitest run modules/legislative-intelligence/adapters/congress-gov",
  "test:pestel:conformance": "vitest run modules/legislative-intelligence/conformance.test.ts",
  "test:pestel:mcp": "vitest run src/tools/registerPestelLegislativeIngest.test.ts src/tools/registerPestelImpactBrief.test.ts"
}
```

- [ ] **Step 4: Write the operator runbook**

`docs/pestel-friendly/runbook.md` must state:

```text
1. Never paste a Congress.gov API key into chat or Git.
2. Canonical secret file: ~/.alpha/credentials/congress-gov/api-key.dpapi.
3. Admission receipt reference: CONGRESS-GOV-API-KEY-001.
4. Enable MCP tools only with VSR_PESTEL_MCP_R0_1=1 plus explicit --allow-tools entries.
5. Example tool IDs: pestelLegislativeIngest,pestelImpactBrief.
6. Read-only legislative intelligence is not Warden authority.
7. Any consequential action must use buildPestelConsequentialWardenRequestV1 and the existing Warden decision service.
8. River evidence receipt in R0.1 has persistenceState LOCAL_DOMAIN_RECEIPT; do not claim durable River publication.
9. Registry output is candidate-only; no identity mutation occurs.
10. R0.1 performs no SILK settlement.
```

Include local verification commands:

```bash
npm run test:pestel
npm run test:pestel:congress
npm run test:pestel:conformance
npm run test:pestel:mcp
npm run type-check
npm test -- --run
```

- [ ] **Step 5: Run the complete verification suite**

Run in this order:

```bash
npm run test:pestel
npm run test:pestel:congress
npm run test:pestel:conformance
npm run test:pestel:mcp
npm run type-check
npm test -- --run
```

Expected: all commands exit 0. Record exact test counts in the eventual PR body; do not predict them in advance.

- [ ] **Step 6: Inspect the diff for credential and authority regressions**

Run:

```bash
git diff --check
git grep -nEi '(api[_-]?key\s*[:=]\s*["'"'][^"'"']+|sentinel-secret|authorization\s*[:=]\s*bearer)' -- ':!package-lock.json' || true
git diff genesis...HEAD -- modules src/tools src/commands/start-server.ts package.json .gitignore docs/pestel-friendly schemas/pestel
```

Expected: no real key material; the string `sentinel-secret` appears only in tests designed to prove redaction.

- [ ] **Step 7: Commit**

```bash
git add modules/legislative-intelligence/conformance.test.ts docs/pestel-friendly/runbook.md package.json
git commit -m "test: qualify PESTEL legislative intelligence R0.1"
```

---

## Final Acceptance Gate

Before opening a PR, verify all of the following:

- one `119/hr/6048` fixture path is retrieved through a credential-provider abstraction;
- live runtime credentials are acquired only at the HTTP execution boundary;
- no credential appears in URL, log, source receipt, River receipt, brief, tool input, or tool output;
- source event and interpretation objects remain separate;
- lifecycle cannot promote introduction or House passage to enacted law;
- all six PESTEL dimensions are present and bounded;
- proposed legislation cannot become `obligationCandidate=true`;
- Registry matches are candidate-only and non-mutating;
- River evidence is replayable and truthfully labelled `LOCAL_DOMAIN_RECEIPT`;
- Synnergyze work is `authorized:false`;
- PESTEL evidence never becomes an `authorityRef`;
- consequential action is routed through `buildWardenDecisionRequestV1`;
- MCP tools require environment enablement plus explicit allow-listing;
- existing Warden/River/Synnergyze regression tests remain green;
- no SILK action exists in R0.1.

## Execution Sequence

Implement Tasks 1 through 10 in order. Each task is a reviewer gate and should land as its own commit. Do not open the PR until the final acceptance gate and full regression suite pass.
