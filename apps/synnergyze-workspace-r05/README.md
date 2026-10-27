# Synnergyze — Connected Workspace & Office Panel R0.5

**LOCAL DEMONSTRATION / NO REAL SIGN-IN / NO EXTERNAL EFFECTS**

A small universal **member-to-member collaboration workspace** and a connected **office control panel**. Users do **not** need a new ERP. This demonstrates the human workflow before real integration with DigitalMe, BNR, Warden, RiverOS, ERP, Tally or banking.

## Who it is for and what they see

| Audience | Plain-language UI | What the sample does |
|---|---|---|
| Business A (requester) | **Your workspace**, **New work request**, **Work requests** | Creates a work request after a partner accepts an invitation |
| Business B (partner) | **Join this workroom**, **Accept request**, **Mark completed** | Accepts the workroom and responds to work |
| Office (coordinator) | **Office control panel**, **Waiting for office approval**, **Activity** | Reviews agreed requests and releases them for demonstration |
| Everyone | **Connections**, **Activity history** | Can see clearly that ERP, Tally, membership and ledger are *not connected* |

Three display languages are available: **English, हिन्दी (Hindi) and ಕನ್ನಡ (Kannada)**. Translations are *initial product wording*, not an independently reviewed localisation pack. The business process is intentionally universal; it is **not hard-coded as an apparel, textile or vehicle application**.

## Start on your own authorised computer

Requirements: **Node.js 22 or later** (no npm dependencies for this demo).

From the repository root:

    SYNNERGYZE_DEMO_MODE=1 node apps/synnergyze-workspace-r05/server.mjs

On Windows PowerShell:

    $env:SYNNERGYZE_DEMO_MODE = "1"
    node apps/synnergyze-workspace-r05/server.mjs

Open the URL shown in your terminal (default is **http://127.0.0.1:4177**). The office panel is **http://127.0.0.1:4177/control**.

The code refuses to start unless \`SYNNERGYZE_DEMO_MODE=1\`. It binds to **127.0.0.1**, not a public interface, and sends no network requests outside the local browser/backend pair. **Do not port-forward, reverse-proxy, tunnel or publicly deploy this sample**.

### Persistent local data

- Sample workrooms, invitations, requests, approvals and event history are saved in \`~/.synnergyze/workspace-r05.json\`.
- To choose a separate local test file, set \`SYNNERGYZE_STATE_FILE\` to an authorised absolute path before startup.
- Writes use atomic rename and a file fsync with restrictive POSIX file permissions. This is only a **single-process, single-machine persistence mechanism**, not a transactional database or backup system.
- Restarting the server does not erase the sample workflow. Do not edit the JSON file while the server is running.
- To start fresh, stop the server and **back up/remove only your R0.5 demo JSON file** after verifying its path. Do not delete unrelated Synnergyze data.
- The role switcher (**Business A, Business B, Office**) is deliberately a simulation; request headers are not cryptographic authentication.

### Example walkthrough

1. View as **Business B** and click **Join this workroom**.
2. View as **Business A** and click **New work request**; enter synthetic data only.
3. View as **Business B** and click **Accept request**.
4. View as **Office** (or open \`/control\`) and click **Approve for work**.
5. View as **Business B** and click **Mark completed**.
6. Return to the overview. Requests and activity remain after a browser refresh or backend restart.

### HTTP endpoints (local demo only)

| Method | Endpoint | Action |
|---|---|---|
| GET | \`/api/state\` | Read sample role-scoped workrooms, requests, events and connection status |
| POST | \`/api/invitation/accept\` | Partner accepts sample invitation |
| POST | \`/api/requests\` | Requester creates a work request; idempotency key required |
| POST | \`/api/requests/:id/accept\` | Partner accepts proposed work |
| POST | \`/api/requests/:id/decline\` | Partner declines proposed work |
| POST | \`/api/requests/:id/approve\` | Office approves agreed work |
| POST | \`/api/requests/:id/complete\` | Partner marks office-approved work done |

The \`x-demo-role\` header selects a synthetic user; **it is NOT identity proof**. This API must never be treated as a secure multi-tenant API, nor be exposed on a public network.

## Test

    node --check apps/synnergyze-workspace-r05/server.mjs
    node --check apps/synnergyze-workspace-r05/public/app.js
    node --test apps/synnergyze-workspace-r05/workspace.node-check.mjs

Tests use disposable operating-system temporary directories and do not touch your persistent demo file. The GitHub Actions R0.5 workflow runs these Node checks separately from the repository's existing Vitest tests.

## Security and operational hold

- Local JSON persistence is not PostgreSQL, failover, backups, audit custody, tenant encryption or permissioned cloud storage.
- All users are **simulated role headers**; there is **no real login, GitHub App identity, DigitalMe representation or Warden grant**.
- Activity is a **synthetic local hash-linked sequence**, *not* real RiverOS receipts.
- No real ERP/Tally posting, invoice settlement, wallet, banking action or member invitation is possible.
- No real multi-user private collaboration across devices is present. **The backend is intentionally loopback-only**.
- The frontend is connected only to the local demo backend; no production infrastructure, billing or API keys.
- For genuine access, introduce independently verifiable identity, authenticated sessions, CSRF protection, authorisation, persistent tenant boundaries, migrations, database concurrency, signed evidence and audited integrations.
- No branch merge, production promotion, custom property application, secret exposure, cloud Docker mount or Vercel deployment is authorised.

### Acceptance gates for real work

Before evolving into a persistent multi-organisation pilot: confirmed owner and authority matrix, BNR intake and member consent, Warden policy/admission, durable transactional database, external River receipts, ERP/Tally read/write scope, UI accessibility/localisation testing with **actual participating users**, business workflow UAT and disaster recovery.

This R0.5 prototype illustrates the interface and persistent local mechanics, **not deployment or legal/commercial acceptance**.

Traceability: [Synnergyze sandbox draft PR #153](https://github.com/Believers-common-group/mcp-node-synnergyze/pull/153) and [Governance draft PR #157](https://github.com/Believers-common-group/SynergyzeGovernance/pull/157).
