# PESTEL-Friendly Legislative Intelligence R0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a test-driven Congress.gov legislative-intelligence path that retrieves one federal bill through the existing local credential boundary, normalizes its lifecycle, produces six-dimensional PESTEL signals and Registry impact candidates, preserves non-secret River evidence, creates a Synnergyze review candidate, and invokes the existing Warden request bridge only when a consequential action is proposed.

**Architecture:** Add focused `modules/legislative-intelligence/` and `modules/pestel/` domain modules to the existing `genesis` architecture. Congress.gov remains a read-only source adapter; source observations are kept separate from interpretation; Registry matching is candidate-only; River evidence is reconstructable but non-authoritative; Synnergyze work remains non-authoritative; consequential actions are converted into the repository's existing `WardenDecisionRequestV1` through `buildWardenDecisionRequestV1`. A process-local result store supports the two approved MCP tools without pretending to provide durable storage.

**Tech Stack:** Node.js 22.x, TypeScript 5.8 strict mode, Vitest 3.1, MSW 2.7, Zod 3.24, AJV 8.17, Node `crypto` SHA-256, native `fetch`, existing Warden/River/Synnergyze contracts.

**Spec:** `docs/superpowers/specs/2026-09-02-pestel-friendly-legislative-intelligence-r0-1-design.md`

## Global Constraints

- Warden alone returns `ALLOW`, `ESCALATE`, or `DENY` for consequential action.
- Congress.gov, PESTEL classification, Registry matching, UI, storage, and River evidence are advisory/evidentiary only.
- A PESTEL score never implies authority.
- Source observations and interpretations remain separate records.
- Canonical credential admission remains `CONGRESS-GOV-API-KEY-001`.
- Congress.gov API base is fixed to `https://api.congress.gov/v3`.
- Credential transport is `X-Api-Key`; an API key must never appear in a URL.
- Canonical Windows secret location is `$HOME\.alpha\credentials\congress-gov\api-key.dpapi` in the owning Windows user profile.
- Plaintext credentials are prohibited in Git, source, committed YAML, logs, URLs, screenshots, issue trackers, fixtures, River evidence, and generated briefs.
- Tests use injected fake credentials and mocked HTTP only; CI never needs a live Congress.gov key.
- Lifecycle normalization is deterministic and versioned; ambiguous source state maps to `UNKNOWN` or the least-advanced defensible state.
- Registry matches remain candidates and must never mutate stable Registry identity.
- R0.1 does not execute SILK settlement.
- No new Registry authority is created. The live `genesis` branch has no `modules/genesis/` domain namespace, so the approved Registry candidate bridge is represented by `modules/legislative-intelligence/impact-graph.ts` until a real Registry write contract exists.
- River R0.1 persistence is labelled `LOCAL_DOMAIN_RECEIPT`; no code may claim live River publication.
- Follow repository style: ESM, `.ts` import suffixes, strict types, deterministic SHA-256 refs where generated.
- Every implementation task starts with a failing Vitest test and ends with targeted tests; run `npm run type-check` whenever `modules/**` types change.

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
  impact-graph.ts
  impact-graph.test.ts
  result-store.ts
  result-store.test.ts
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

config/pestel/
  sources.json
  lifecycle-map.json
  classification-policy.json

src/tools/
  registerPestelLegislativeIngest.ts
  registerPestelLegislativeIngest.test.ts
  registerPestelImpactBrief.ts
  registerPestelImpactBrief.test.ts

scripts/
  validate-congress-gov-runtime.ts

docs/pestel-friendly/
  architecture.md
  congress-gov-source-contract.md
  lifecycle-model.md
  evidence-contract.md
  runbook.md
```

Modify:

```text
src/commands/start-server.ts
package.json
.gitignore
```

Do not change the semantics of existing Warden decision, River reservation, controlled-execution, effect-verification, reconciliation, Registry bridge, or SILK modules.

---

### Task 1: Canonical Contracts, Hashing, Schemas, and Static Configuration

**Files:**
- Create: `modules/legislative-intelligence/contracts.ts`
- Create: `modules/legislative-intelligence/canonical.ts`
- Create: `modules/legislative-intelligence/contracts.test.ts`
- Create: `modules/legislative-intelligence/canonical.test.ts`
- Create: all five `schemas/pestel/*.schema.json` files
- Create: `config/pestel/sources.json`
- Create: `config/pestel/lifecycle-map.json`
- Create: `config/pestel/classification-policy.json`

**Interfaces:**
- Consumes: none.
- Produces: `LegislativeObjectRefV1`, `SourceEnvelopeV1`, `RelatedSourceBundleV1`, `SourceHealthV1`, `LegislativeLifecycleStateV1`, `NormalizedLegislativeEventV1`, `canonicalizeV1(value)`, `sha256CanonicalV1(value)`.

- [ ] **Step 1: Write the failing contract tests**

Create `modules/legislative-intelligence/contracts.test.ts`:

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
      schemaVersion: "LEG-SOURCE:R0.1",
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
      schemaVersion: "LEG-EVENT:R0.1",
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
  it("is stable across object key order", () => {
    expect(canonicalizeV1({ b: 2, a: 1 })).toBe(canonicalizeV1({ a: 1, b: 2 }));
    expect(sha256CanonicalV1({ b: 2, a: 1 })).toBe(sha256CanonicalV1({ a: 1, b: 2 }));
  });
});
```

- [ ] **Step 2: Run tests to verify RED**

```bash
npx vitest run modules/legislative-intelligence/contracts.test.ts modules/legislative-intelligence/canonical.test.ts
```

Expected: FAIL because the files and exports do not exist.

- [ ] **Step 3: Implement the exact contracts**

`contracts.ts`:

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
  schemaVersion: "LEG-SOURCE:R0.1";
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
  schemaVersion: "LEG-EVENT:R0.1";
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
  credentialAdmissionRef: "CONGRESS-GOV-API-KEY-001";
  credentialFingerprintPrefix?: string;
}
```

- [ ] **Step 4: Implement canonical JSON hashing**

`canonical.ts`:

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

- [ ] **Step 5: Add schemas and static config**

All five schemas use Draft 2020-12, `additionalProperties: false`, and fixed `schemaVersion` constants matching TypeScript types. No schema may define `apiKey`, `credentialValue`, `secret`, or authorization-token fields.

`config/pestel/sources.json`:

```json
{
  "schemaVersion": "PESTEL-SOURCES:R0.1",
  "sources": [{
    "sourceSystem": "congress.gov",
    "jurisdiction": "US-FEDERAL",
    "apiBase": "https://api.congress.gov/v3",
    "credentialAdmissionRef": "CONGRESS-GOV-API-KEY-001",
    "transportHeader": "X-Api-Key"
  }]
}
```

`config/pestel/lifecycle-map.json` must list advancing evidence families only: `committee_reported`, `chamber_passed`, `conference`, `enrolled`, `presented_to_president`. It must not map any of them to `ADOPTED`.

`config/pestel/classification-policy.json` must define deterministic term groups for tax, subsidy, trade, labour, reporting, technology, privacy/data, environment, health/safety, infrastructure, enforcement, courts, and public administration, plus `deterministicConfidenceCap: 0.75`.

- [ ] **Step 6: Run tests and type-check**

```bash
npx vitest run modules/legislative-intelligence/contracts.test.ts modules/legislative-intelligence/canonical.test.ts
npm run type-check
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add modules/legislative-intelligence/contracts* modules/legislative-intelligence/canonical* schemas/pestel config/pestel
git commit -m "feat: add legislative intelligence contracts"
```

---

### Task 2: Deterministic Legislative Lifecycle Normalizer

**Files:**
- Create: `modules/legislative-intelligence/lifecycle.ts`
- Create: `modules/legislative-intelligence/lifecycle.test.ts`

**Interfaces:**
- Consumes: `LegislativeLifecycleStateV1`, `config/pestel/lifecycle-map.json`.
- Produces: `LifecycleActionEvidenceV1`, `LifecycleEvidenceV1`, `normalizeLegislativeLifecycleV1(input): LegislativeLifecycleStateV1`.

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest";
import { normalizeLegislativeLifecycleV1 } from "./lifecycle.ts";

describe("normalizeLegislativeLifecycleV1", () => {
  it("keeps introduction at PROPOSAL", () => {
    expect(normalizeLegislativeLifecycleV1({ introduced: true, actions: [] })).toBe("PROPOSAL");
  });

  it("maps House passage to ADVANCING, not ADOPTED", () => {
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

  it("uses UNKNOWN for unsupported ambiguous material", () => {
    expect(normalizeLegislativeLifecycleV1({ introduced: false, actions: [{ text: "Activity" }] })).toBe("UNKNOWN");
  });
});
```

- [ ] **Step 2: Verify RED**

```bash
npx vitest run modules/legislative-intelligence/lifecycle.test.ts
```

Expected: FAIL because `lifecycle.ts` does not exist.

- [ ] **Step 3: Implement lifecycle evidence and deterministic rules**

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

Rule order:

```text
superseded -> SUPERSEDED
withdrawn -> WITHDRAWN
failed -> FAILED
enforcementEvidence -> ENFORCED
lawNumber + effectiveDate <= evaluatedAt -> EFFECTIVE
lawNumber -> ADOPTED
recognized advancing evidence -> ADVANCING
introduced -> PROPOSAL
otherwise -> UNKNOWN
```

The recognized advancing patterns are loaded from `lifecycle-map.json`. Unknown action codes/text do not advance lifecycle.

- [ ] **Step 4: Verify GREEN and type-check**

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
- Consumes: Task 1 contracts and canonical hash.
- Produces: `LegislativeSourceAdapterV1`, `CongressGovCredentialProviderV1`, `StaticCongressGovCredentialProviderV1`, `WindowsDpapiCongressGovCredentialProviderV1`, `CongressGovClientV1`.

- [ ] **Step 1: Define the source-adapter interface in a failing compile test**

`source-adapter.ts` must ultimately export exactly:

```ts
import type {
  LegislativeObjectRefV1,
  RelatedSourceBundleV1,
  SourceEnvelopeV1,
  SourceHealthV1,
} from "../contracts.ts";

export interface LegislativeSourceAdapterV1 {
  getObject(ref: LegislativeObjectRefV1): Promise<SourceEnvelopeV1>;
  getActions(ref: LegislativeObjectRefV1): Promise<readonly SourceEnvelopeV1[]>;
  getRelated(ref: LegislativeObjectRefV1): Promise<RelatedSourceBundleV1>;
  health(): Promise<SourceHealthV1>;
}
```

Import that type in `client.test.ts`; the initial test run must fail because the file does not exist.

- [ ] **Step 2: Write credential-provider tests**

```ts
import { describe, expect, it } from "vitest";
import { StaticCongressGovCredentialProviderV1 } from "./credential-provider.ts";

describe("Congress.gov credential provider", () => {
  it("keeps secret value out of admissible metadata", async () => {
    const provider = new StaticCongressGovCredentialProviderV1("sentinel-secret", {
      admissionRef: "CONGRESS-GOV-API-KEY-001",
      fingerprintPrefix: "abc123",
    });
    expect(await provider.getCredential()).toBe("sentinel-secret");
    expect(JSON.stringify(provider.metadata())).not.toContain("sentinel-secret");
  });
});
```

- [ ] **Step 3: Write MSW client tests**

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
  it("injects the credential only in X-Api-Key", async () => {
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

- [ ] **Step 4: Verify RED**

```bash
npx vitest run modules/legislative-intelligence/adapters/congress-gov/credential-provider.test.ts modules/legislative-intelligence/adapters/congress-gov/client.test.ts
```

Expected: FAIL because the adapter files do not exist.

- [ ] **Step 5: Implement credential providers**

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

`StaticCongressGovCredentialProviderV1` is for tests and injected runtimes only.

`WindowsDpapiCongressGovCredentialProviderV1` resolves PowerShell as follows:

```text
process.platform === "win32" -> powershell.exe
WSL_INTEROP is present -> powershell.exe
otherwise -> CREDENTIAL_PLATFORM_UNSUPPORTED
```

The default child process expands `$HOME\.alpha\credentials\congress-gov\api-key.dpapi` inside Windows PowerShell, so WSL does not reinterpret the Windows user-profile location.

PowerShell decryption behavior:

```text
1. read the file without printing its content;
2. first attempt UTF-8 DPAPI text via ConvertTo-SecureString + Marshal.SecureStringToBSTR;
3. if that fails, attempt binary ProtectedData.Unprotect(..., CurrentUser) + UTF-8 decode;
4. write only the decrypted value to stdout;
5. never write decrypted value or file bytes to stderr;
6. clear/free temporary secure-string/BSTR/byte variables before exit.
```

Node must map failures to only these non-secret codes: `CREDENTIAL_FILE_MISSING`, `CREDENTIAL_FILE_EMPTY`, `CREDENTIAL_DECRYPT_FAILED`, `CREDENTIAL_PLATFORM_UNSUPPORTED`.

- [ ] **Step 6: Implement the HTTP client**

`CongressGovClientV1.getJson(path, sourceObjectType, sourceObjectId)`:

```text
1. path must begin with `/`;
2. resolve only under https://api.congress.gov/v3;
3. reject query keys matching api_key or apikey;
4. call provider.getCredential immediately before fetch;
5. set X-Api-Key only on the outbound Request;
6. retry only 429 and 5xx GET responses, maximum two retries, honoring Retry-After when <= 5 seconds;
7. parse JSON only on 2xx;
8. map 401/403/404/429/5xx to CongressGovHttpErrorV1 with status/path/errorCode but no response body or credential;
9. build SourceEnvelopeV1 from response metadata and sha256CanonicalV1(body).
```

`health()` calls `/congress?limit=1&format=json` and returns `SourceHealthV1`; it never returns the credential.

Add to `.gitignore`:

```text
.alpha/credentials/
*.dpapi
*.secret
```

- [ ] **Step 7: Verify GREEN and type-check**

```bash
npx vitest run modules/legislative-intelligence/adapters/congress-gov/credential-provider.test.ts modules/legislative-intelligence/adapters/congress-gov/client.test.ts
npm run type-check
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add modules/legislative-intelligence/adapters .gitignore
git commit -m "feat: add governed Congress.gov source client"
```

---

### Task 4: Congress.gov Source Adapter and Deterministic Normalizer

**Files:**
- Create: `modules/legislative-intelligence/adapters/congress-gov/mapper.ts`
- Create: `modules/legislative-intelligence/adapters/congress-gov/mapper.test.ts`
- Create: `modules/legislative-intelligence/normalizer.ts`
- Create: `modules/legislative-intelligence/normalizer.test.ts`
- Create: all six Congress.gov fixture JSON files

**Interfaces:**
- Consumes: `CongressGovClientV1`, `LegislativeSourceAdapterV1`, lifecycle normalizer, canonical hashing.
- Produces: `CongressGovSourceAdapterV1`, `normalizeCongressGovBillV1(bundle, normalizedAt): NormalizedLegislativeEventV1`.

- [ ] **Step 1: Add six shape-compatible H.R.6048 fixtures**

`bill-detail.json`:

```json
{
  "bill": {
    "congress": 119,
    "type": "HR",
    "number": "6048",
    "title": "NDO Fairness Act of 2025",
    "introducedDate": "2025-11-03",
    "latestAction": { "actionDate": "2026-08-31", "text": "Passed House" },
    "laws": []
  }
}
```

`bill-actions.json` contains introduction and House-passage actions. `bill-subjects.json` contains `Constitutional rights`, `Electronic communications`, and `Law enforcement`. `bill-committees.json` contains one committee. `bill-amendments.json` contains an empty amendments array. `bill-summaries.json` contains one short fixture summary explicitly marked synthetic fixture text. No fixture contains credential material.

- [ ] **Step 2: Write red tests for endpoint coverage and normalization**

The adapter test must assert calls to:

```text
/bill/119/hr/6048
/bill/119/hr/6048/actions
/bill/119/hr/6048/amendments
/bill/119/hr/6048/committees
/bill/119/hr/6048/subjects
/bill/119/hr/6048/summaries
```

Add a separate law-detail test where bill detail contains:

```json
"laws": [{ "type": "Public Law", "number": "12", "url": "https://api.congress.gov/v3/law/119/public/12" }]
```

Expected: `getRelated()` follows that official same-base URL and returns `law`; if `laws` exists but no safe same-base law URL can be resolved, it throws `LAW_DETAIL_UNRESOLVABLE` instead of silently declaring adoption.

Normalizer test:

```ts
it("normalizes the same bundle deterministically", () => {
  const first = normalizeCongressGovBillV1(bundle, "2026-09-02T00:00:00.000Z");
  const second = normalizeCongressGovBillV1(bundle, "2026-09-02T00:00:00.000Z");
  expect(first.eventRef).toBe(second.eventRef);
  expect(first.lifecycle).toBe("ADVANCING");
  expect(first.subjects).toEqual([...first.subjects].sort());
});
```

- [ ] **Step 3: Verify RED**

```bash
npx vitest run modules/legislative-intelligence/adapters/congress-gov/mapper.test.ts modules/legislative-intelligence/normalizer.test.ts
```

Expected: FAIL because mapper/normalizer do not exist.

- [ ] **Step 4: Implement `CongressGovSourceAdapterV1`**

Exact methods:

```ts
export class CongressGovSourceAdapterV1 implements LegislativeSourceAdapterV1 {
  constructor(private readonly client: CongressGovClientV1) {}
  getObject(ref: LegislativeObjectRefV1): Promise<SourceEnvelopeV1>;
  getActions(ref: LegislativeObjectRefV1): Promise<readonly SourceEnvelopeV1[]>;
  getRelated(ref: LegislativeObjectRefV1): Promise<RelatedSourceBundleV1>;
  health(): Promise<SourceHealthV1>;
}
```

Pagination behavior: follow `pagination.next` only when its resolved origin/path remains under `https://api.congress.gov/v3`; reject any next URL containing `api_key`/`apikey`; accumulate pages in observed order and generate one `SourceEnvelopeV1` per page.

- [ ] **Step 5: Implement `normalizeCongressGovBillV1`**

Normalization algorithm:

```text
1. validate 119/hr/6048 identity across source envelopes;
2. preserve sourceRefs and raw hashes separately from interpretation;
3. derive LifecycleEvidenceV1 from actions plus authoritative law source when present;
4. normalize/sort/dedupe subjects, committees, actors, actionRefs, evidenceRefs;
5. compute eventRef from jurisdiction, objectId, lifecycle, title, summary, dates, normalized lists, and source body hashes;
6. exclude normalizedAt, retrievedAt, rate-limit state, and credential metadata from event identity;
7. set schemaVersion LEG-EVENT:R0.1 and normalizerVersion LEG-NORMALIZER:R0.1.
```

- [ ] **Step 6: Verify GREEN and type-check**

```bash
npx vitest run modules/legislative-intelligence/adapters/congress-gov/mapper.test.ts modules/legislative-intelligence/normalizer.test.ts
npm run type-check
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add modules/legislative-intelligence/adapters/congress-gov modules/legislative-intelligence/normalizer.ts modules/legislative-intelligence/normalizer.test.ts
git commit -m "feat: normalize Congress.gov legislative sources"
```

---

### Task 5: Six-Dimensional PESTEL Classification and Impact Brief

**Files:**
- Create: `modules/pestel/contracts.ts`
- Create: `modules/pestel/rules.ts`
- Create: `modules/pestel/classifier.ts`
- Create: `modules/pestel/classifier.test.ts`
- Create: `modules/pestel/impact-brief.ts`
- Create: `modules/pestel/impact-brief.test.ts`

**Interfaces:**
- Consumes: `NormalizedLegislativeEventV1`, classification policy JSON, canonical hash.
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
});

it("never treats a proposal as a legal obligation", async () => {
  const signal = await classifyPestelV1({ ...event, lifecycle: "PROPOSAL" }, { classifierVersion: "PESTEL:R0.1" });
  expect(signal.obligationCandidate).toBe(false);
});
```

- [ ] **Step 2: Verify RED**

```bash
npx vitest run modules/pestel/classifier.test.ts modules/pestel/impact-brief.test.ts
```

Expected: FAIL because PESTEL files do not exist.

- [ ] **Step 3: Implement contracts and deterministic rules**

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
  schemaVersion: "PESTEL-SIGNAL:R0.1";
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

`rules.ts` loads term groups from `classification-policy.json`; scores accumulate and clamp to `[0,1]`. Every non-zero dimension must have at least one rationale entry.

- [ ] **Step 4: Implement model-assist as an optional interface, not a provider dependency**

```ts
export interface PestelClassifierAssistV1 {
  classify(event: NormalizedLegislativeEventV1): Promise<{
    vector: Partial<Record<PestelDimensionV1, number>>;
    rationale: readonly PestelRationaleV1[];
    confidence: number;
  }>;
}
```

Without `assist`, emit deterministic values and cap confidence at `0.75`. With `assist`, validate all values; model rationale may reference only evidence refs already present on the event; merge supplied dimension values by arithmetic mean with deterministic values. Reject unexplained model scores.

`obligationCandidate` may be true only for `ADOPTED`, `EFFECTIVE`, or `ENFORCED` plus deterministic obligation/enforcement evidence.

- [ ] **Step 5: Implement `ImpactBriefV1`**

```ts
export interface ImpactBriefV1 {
  schemaVersion: "PESTEL-BRIEF:R0.1";
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

Observed facts may only restate normalized event facts. Inferred consequences must be stored in hypothesis arrays and prefixed `Hypothesis:`. A brief may not say a proposal is law.

- [ ] **Step 6: Verify GREEN and type-check**

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

### Task 6: Registry Impact Graph, River Evidence, and Synnergyze Review Candidate

**Files:**
- Create: `modules/legislative-intelligence/impact-graph.ts`
- Create: `modules/legislative-intelligence/impact-graph.test.ts`
- Create: `modules/river/legislative-evidence.ts`
- Create: `modules/river/legislative-evidence.test.ts`
- Create: `modules/synnergyze/pestel-work-bridge.ts`
- Create: `modules/synnergyze/pestel-work-bridge.test.ts`

**Interfaces:**
- Consumes: normalized event, `PestelSignalV1`, `ImpactBriefV1`, source envelopes, canonical hash.
- Produces: `RegistrySubjectIndexEntryV1`, `RegistryImpactCandidateV1`, `mapRegistryImpactCandidatesV1`, `LegislativeEvidenceReceiptV1`, `buildLegislativeEvidenceReceiptV1`, `PestelReviewWorkCandidateV1`, `buildPestelReviewWorkCandidateV1`.

- [ ] **Step 1: Write impact-graph red test**

```ts
it("emits relational Registry candidates only", () => {
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

- [ ] **Step 2: Write River evidence red test**

```ts
it("preserves replay metadata without credential material", () => {
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
  expect(receipt.persistenceState).toBe("LOCAL_DOMAIN_RECEIPT");
});
```

- [ ] **Step 3: Write Synnergyze candidate red test**

```ts
it("creates a non-authoritative review candidate", () => {
  const work = buildPestelReviewWorkCandidateV1({ event, signal, brief, registryCandidates });
  expect(work.state).toBe("REVIEW_CANDIDATE");
  expect(work.authorized).toBe(false);
  expect(work).not.toHaveProperty("actionToken");
});
```

- [ ] **Step 4: Verify RED**

```bash
npx vitest run modules/legislative-intelligence/impact-graph.test.ts modules/river/legislative-evidence.test.ts modules/synnergyze/pestel-work-bridge.test.ts
```

Expected: FAIL because the files do not exist.

- [ ] **Step 5: Implement the Registry candidate graph**

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

R0.1 uses normalized term intersection. Default relation is `MAY_AFFECT`. Stronger relations require matching deterministic classifier rationale. This module exposes no Registry write method.

- [ ] **Step 6: Implement River evidence**

```ts
export interface LegislativeEvidenceReceiptV1 {
  schemaVersion: "RIVER-LEG-EVIDENCE:R0.1";
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

Compute `evidenceRef` from substantive fields excluding `observedAt`. Never include source response bodies, credential values, or request headers.

- [ ] **Step 7: Implement Synnergyze review candidate**

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

Generate deterministic work/correlation refs from event/signal/brief identities. Do not return Warden tokens or execution grants.

- [ ] **Step 8: Verify GREEN and type-check**

```bash
npx vitest run modules/legislative-intelligence/impact-graph.test.ts modules/river/legislative-evidence.test.ts modules/synnergyze/pestel-work-bridge.test.ts
npm run type-check
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add modules/legislative-intelligence/impact-graph* modules/river/legislative-evidence* modules/synnergyze/pestel-work-bridge*
git commit -m "feat: add impact graph and legislative evidence"
```

---

### Task 7: End-to-End Service, Result Store, and Warden Consequential-Action Bridge

**Files:**
- Create: `modules/legislative-intelligence/service.ts`
- Create: `modules/legislative-intelligence/service.test.ts`
- Create: `modules/legislative-intelligence/result-store.ts`
- Create: `modules/legislative-intelligence/result-store.test.ts`
- Create: `modules/warden/pestel-review-request.ts`
- Create: `modules/warden/pestel-review-request.test.ts`

**Interfaces:**
- Consumes: source adapter, normalizer, classifier, brief builder, impact graph, River evidence, Synnergyze work builder, existing `buildWardenDecisionRequestV1`.
- Produces: `LegislativeIntelligenceResultV1`, `LegislativeIntelligenceServiceV1.ingestBill`, `LegislativeIntelligenceResultStoreV1`, `InMemoryLegislativeIntelligenceResultStoreV1`, `PestelConsequentialActionProposalV1`, `buildPestelConsequentialWardenRequestV1`.

- [ ] **Step 1: Write service and result-store red tests**

```ts
const result = await service.ingestBill(ref, {
  observedAt: "2026-09-02T00:00:00.000Z",
  registryIndex,
});
expect(result.event.lifecycle).toBe("ADVANCING");
expect(result.signal.legislativeEventRef).toBe(result.event.eventRef);
expect(result.workCandidate.authorized).toBe(false);
expect(result).not.toHaveProperty("wardenDecision");

await store.put(result);
expect(await store.getBySignalRef(result.signal.signalRef)).toEqual(result);
```

Store collision test: writing a different result with the same `signalRef` must throw `RESULT_STORE_IDENTITY_COLLISION` rather than overwrite it.

- [ ] **Step 2: Write Warden bridge red tests**

```ts
it("routes consequential action through the existing Warden bridge", () => {
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

- [ ] **Step 3: Verify RED**

```bash
npx vitest run modules/legislative-intelligence/service.test.ts modules/legislative-intelligence/result-store.test.ts modules/warden/pestel-review-request.test.ts
```

Expected: FAIL because the files do not exist.

- [ ] **Step 4: Implement `LegislativeIntelligenceServiceV1`**

```ts
export interface LegislativeIntelligenceResultV1 {
  event: NormalizedLegislativeEventV1;
  signal: PestelSignalV1;
  brief: ImpactBriefV1;
  registryCandidates: readonly RegistryImpactCandidateV1[];
  evidence: LegislativeEvidenceReceiptV1;
  workCandidate: PestelReviewWorkCandidateV1;
}

export class LegislativeIntelligenceServiceV1 {
  constructor(
    private readonly source: LegislativeSourceAdapterV1,
    private readonly classifierAssist?: PestelClassifierAssistV1,
  ) {}

  ingestBill(
    ref: LegislativeObjectRefV1,
    options: { observedAt: string; registryIndex: readonly RegistrySubjectIndexEntryV1[] },
  ): Promise<LegislativeIntelligenceResultV1>;
}
```

Exact pipeline:

```text
source.getRelated
-> normalizeCongressGovBillV1
-> classifyPestelV1
-> buildImpactBriefV1
-> mapRegistryImpactCandidatesV1
-> buildLegislativeEvidenceReceiptV1
-> buildPestelReviewWorkCandidateV1
-> immutable result
```

Source/parse/lifecycle/evidence/classification failures terminate with non-secret errors. Registry match uncertainty yields an empty candidate list.

- [ ] **Step 5: Implement the process-local result store**

```ts
export interface LegislativeIntelligenceResultStoreV1 {
  put(result: LegislativeIntelligenceResultV1): Promise<void>;
  getBySignalRef(signalRef: string): Promise<LegislativeIntelligenceResultV1 | undefined>;
}

export class InMemoryLegislativeIntelligenceResultStoreV1 implements LegislativeIntelligenceResultStoreV1 {
  private readonly bySignalRef = new Map<string, LegislativeIntelligenceResultV1>();
  // exact-match idempotent put; conflicting same signalRef fails closed
}
```

This is explicitly non-durable and does not claim River or Registry persistence.

- [ ] **Step 6: Implement consequential-action proposal bridge**

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

`buildPestelConsequentialWardenRequestV1` constructs a non-authoritative Synnergyze program/event pair:

```text
program.state = READY_FOR_AUTHORIZATION
program.authorized = false
event.state = DRAFT
event.authorized = false
sourcePlanRef = workCandidate.workRef
sourceIntentRef = proposal.proposalRef
sourceExpressionRef = workCandidate.briefRef
capabilityRef/targetRef/action = exact caller proposal values
correlationId = workCandidate.correlationId
```

Then call existing `buildWardenDecisionRequestV1`. PESTEL evidence refs must never be inserted into `authorityRefs`; authority/policy refs come only from `ResolvedRepresentationContextV1`.

- [ ] **Step 7: Verify GREEN plus existing bridge regression**

```bash
npx vitest run modules/legislative-intelligence/service.test.ts modules/legislative-intelligence/result-store.test.ts modules/warden/pestel-review-request.test.ts modules/synnergyze/warden-request-bridge.test.ts
npm run type-check
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add modules/legislative-intelligence/service* modules/legislative-intelligence/result-store* modules/warden/pestel-review-request*
git commit -m "feat: add legislative intelligence service and Warden boundary"
```

---

### Task 8: Approved MCP Tools and Server Registration

**Files:**
- Create: `src/tools/registerPestelLegislativeIngest.ts`
- Create: `src/tools/registerPestelLegislativeIngest.test.ts`
- Create: `src/tools/registerPestelImpactBrief.ts`
- Create: `src/tools/registerPestelImpactBrief.test.ts`
- Modify: `src/commands/start-server.ts`

**Interfaces:**
- Consumes: service, result store, credential provider, `CustomMcpServer`, `ToolFilter`.
- Produces exact MCP operation IDs `pestel_legislative_ingest` and `pestel_impact_brief`.

- [ ] **Step 1: Write registration red tests**

Assert for both tools:

```text
- not registered unless VSR_PESTEL_MCP_R0_1=1;
- not registered unless exact operation ID is present in --allow-tools;
- generic "all" does not implicitly expose it;
- annotation readOnlyHint is true;
- input schema contains no apiKey, secret, credentialValue, or token field;
- output never serializes sentinel-secret.
```

- [ ] **Step 2: Verify RED**

```bash
npx vitest run src/tools/registerPestelLegislativeIngest.test.ts src/tools/registerPestelImpactBrief.test.ts
```

Expected: FAIL because registration files do not exist.

- [ ] **Step 3: Implement `pestel_legislative_ingest`**

Exact operation ID:

```ts
export const operationId = "pestel_legislative_ingest";
```

Input:

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

The callback runs `service.ingestBill`, writes the immutable result to the shared `LegislativeIntelligenceResultStoreV1`, and returns source receipt refs, normalized lifecycle, `signalRef`, evidence refs, brief ref, Registry candidate refs, and work candidate. No API key is accepted or returned.

Default runtime factory uses `WindowsDpapiCongressGovCredentialProviderV1`; tests inject `StaticCongressGovCredentialProviderV1`.

- [ ] **Step 4: Implement `pestel_impact_brief` with the approved signal-ID input contract**

Exact operation ID:

```ts
export const operationId = "pestel_impact_brief";
```

Input:

```ts
const inputSchema = z.object({ signalRef: z.string().min(1) }).strict();
```

Callback loads `store.getBySignalRef(signalRef)`. If absent, return/throw a bounded `SIGNAL_NOT_FOUND` error. If present, return the stored evidence-backed brief plus Registry impact candidates. This tool performs no network request and does not trigger Warden.

- [ ] **Step 5: Implement dual opt-in registration and shared store wiring**

Both tools use:

```text
VSR_PESTEL_MCP_R0_1=1
```

Registration gate:

```ts
if (env[enableEnvironmentVariable] !== "1") return false;
if (!filter.allowedTools?.has(operationId)) return false;
if (!isToolAllowed(operationId, filter)) return false;
```

In `createServer()`, instantiate one shared `InMemoryLegislativeIntelligenceResultStoreV1` and pass it to both registration helpers before generic OpenAPI registration. Do not expose the store as a tool.

- [ ] **Step 6: Verify GREEN plus server regressions**

```bash
npx vitest run src/tools/registerPestelLegislativeIngest.test.ts src/tools/registerPestelImpactBrief.test.ts src/commands/start-server.warden.test.ts src/commands/start-server.river.test.ts src/commands/start-server.synnergyze.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/tools/registerPestelLegislativeIngest* src/tools/registerPestelImpactBrief* src/commands/start-server.ts
git commit -m "feat: expose bounded PESTEL legislative MCP tools"
```

---

### Task 9: Conformance, Runtime Validation, Documentation, and Package Scripts

**Files:**
- Create: `modules/legislative-intelligence/conformance.test.ts`
- Create: `scripts/validate-congress-gov-runtime.ts`
- Create: all five `docs/pestel-friendly/*.md` files
- Modify: `package.json`

**Interfaces:**
- Consumes: complete R0.1 pipeline.
- Produces: deterministic replay proof, local runtime health probe, operator documentation.

- [ ] **Step 1: Write deterministic replay and secret-leak conformance tests**

```ts
it("replays deterministically without credential leakage", async () => {
  const first = await service.ingestBill(ref, options);
  const second = await service.ingestBill(ref, options);
  expect(first.event.eventRef).toBe(second.event.eventRef);
  expect(first.signal.signalRef).toBe(second.signal.signalRef);
  expect(first.brief.briefRef).toBe(second.brief.briefRef);
  expect(first.evidence.evidenceRef).toBe(second.evidence.evidenceRef);
  expect(first.workCandidate.workRef).toBe(second.workCandidate.workRef);
  expect(JSON.stringify([first, second])).not.toContain("sentinel-secret");
});
```

Add a recursive key-name scan that fails if output objects contain keys matching `/api.?key|secret|credential.?value|authorization.?token/i`.

- [ ] **Step 2: Run conformance test**

```bash
npx vitest run modules/legislative-intelligence/conformance.test.ts
```

Expected: PASS only when Tasks 1-8 are correct. Fix owning modules rather than weakening the test.

- [ ] **Step 3: Add package scripts**

Merge into existing scripts:

```json
{
  "test:pestel": "vitest run modules/pestel modules/legislative-intelligence modules/river/legislative-evidence.test.ts modules/synnergyze/pestel-work-bridge.test.ts modules/warden/pestel-review-request.test.ts",
  "test:pestel:congress": "vitest run modules/legislative-intelligence/adapters/congress-gov",
  "test:pestel:conformance": "vitest run modules/legislative-intelligence/conformance.test.ts",
  "test:pestel:mcp": "vitest run src/tools/registerPestelLegislativeIngest.test.ts src/tools/registerPestelImpactBrief.test.ts",
  "validate:pestel:congress": "node --experimental-strip-types scripts/validate-congress-gov-runtime.ts"
}
```

- [ ] **Step 4: Implement the local runtime validator**

`scripts/validate-congress-gov-runtime.ts` instantiates `WindowsDpapiCongressGovCredentialProviderV1` and `CongressGovClientV1`, calls `health()`, and prints only:

```json
{
  "sourceSystem": "congress.gov",
  "ok": true,
  "httpStatus": 200,
  "credentialAdmissionRef": "CONGRESS-GOV-API-KEY-001",
  "credentialFingerprintPrefix": "optional-non-secret-prefix",
  "checkedAt": "ISO-8601"
}
```

On failure print a non-secret error code and exit non-zero. Never print a response body, request headers, decrypted credential, or DPAPI bytes.

- [ ] **Step 5: Write the five approved documents**

`architecture.md` documents:

```text
Congress.gov -> source envelopes -> lifecycle normalization -> PESTEL signal -> Registry candidates -> River local receipt -> Synnergyze review candidate
Consequential action only -> existing Warden request bridge
No SILK settlement in R0.1
```

`congress-gov-source-contract.md` documents fixed base URL, minimum endpoint set, conditional official law-detail read, pagination restrictions, `X-Api-Key`, safe retries, and non-secret errors.

`lifecycle-model.md` lists all ten lifecycle states and the exact least-advanced mapping rules.

`evidence-contract.md` distinguishes source observation, interpretation, local River receipt, Registry candidate, and Warden authority; it explicitly states `LOCAL_DOMAIN_RECEIPT` is not live River publication.

`runbook.md` states:

```text
1. Never paste a Congress.gov API key into chat or Git.
2. Canonical secret path is the Windows-user $HOME\.alpha\credentials\congress-gov\api-key.dpapi.
3. Admission reference is CONGRESS-GOV-API-KEY-001.
4. Enable tools only with VSR_PESTEL_MCP_R0_1=1 plus explicit --allow-tools.
5. Tool IDs are pestel_legislative_ingest and pestel_impact_brief.
6. Read-only legislative intelligence is not Warden authority.
7. Consequential action must use buildPestelConsequentialWardenRequestV1 and the existing Warden decision service.
8. Registry output is candidate-only.
9. River evidence is LOCAL_DOMAIN_RECEIPT in R0.1.
10. R0.1 performs no SILK settlement.
```

- [ ] **Step 6: Run the complete verification suite**

```bash
npm run test:pestel
npm run test:pestel:congress
npm run test:pestel:conformance
npm run test:pestel:mcp
npm run type-check
npm test -- --run
```

Expected: all commands exit 0. Record actual test counts in the eventual PR body; do not predict them.

The live runtime probe is separate from CI and is run only on an admitted local Windows/WSL environment:

```bash
npm run validate:pestel:congress
```

Expected: non-secret health JSON; no credential output.

- [ ] **Step 7: Inspect diff for credential and authority regressions**

```bash
git diff --check
git grep -nEi 'sentinel-secret|authorization[[:space:]]*[:=][[:space:]]*bearer' -- ':!package-lock.json' || true
git diff genesis...HEAD -- modules src/tools src/commands/start-server.ts scripts package.json .gitignore docs/pestel-friendly schemas/pestel config/pestel
```

Expected: `sentinel-secret` occurs only in tests that prove redaction; no real key material exists; no PESTEL module adds an authority issuer or SILK action.

- [ ] **Step 8: Commit**

```bash
git add modules/legislative-intelligence/conformance.test.ts scripts/validate-congress-gov-runtime.ts docs/pestel-friendly package.json
git commit -m "test: qualify PESTEL legislative intelligence R0.1"
```

---

## Final Acceptance Gate

Before opening a PR, verify all of the following:

- one `119/hr/6048` fixture path covers bill detail, actions, amendments, committees, subjects, and summaries;
- an enacted fixture additionally retrieves official law detail before `ADOPTED` can be emitted;
- runtime credentials are acquired only at the HTTP execution boundary;
- no credential appears in URL, log, source receipt, River receipt, brief, tool input, or tool output;
- source observations and interpretations remain separate objects;
- introduction and House passage cannot become enacted law;
- all six PESTEL dimensions are present and bounded;
- proposed legislation cannot become `obligationCandidate=true`;
- Registry matches are candidate-only and non-mutating;
- River evidence is replayable and truthfully labelled `LOCAL_DOMAIN_RECEIPT`;
- Synnergyze review work is `authorized:false`;
- PESTEL evidence never becomes an `authorityRef`;
- consequential action is routed through the existing `buildWardenDecisionRequestV1` path;
- MCP operation IDs are exactly `pestel_legislative_ingest` and `pestel_impact_brief`;
- `pestel_impact_brief` accepts a signal reference, not an API key or raw source request;
- both MCP tools require environment enablement plus explicit allow-listing;
- existing Warden/River/Synnergyze regression tests remain green;
- no SILK transaction or settlement action exists in R0.1.

## Execution Sequence

Implement Tasks 1 through 9 in order. Each task is a reviewer gate and lands as its own commit. Do not open the PR until the final acceptance gate and full regression suite pass.
