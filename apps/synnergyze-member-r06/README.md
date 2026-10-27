# Synnergyze Member Workspace R0.6

**STATUS: DRAFT / LOCAL PILOT / NOT ADMITTED / NO EXTERNAL EFFECTS**

The R0.6 prototype adds a persistent local **SQLite** membership backend and responsive browser interface with separate business and office views. It evolves R0.5 by replacing its open role switcher with locally provisioned member accounts, scrypt-hashed passwords, expiring server-side sessions, one-use invitation codes and role-scoped workrooms.

**This remains a source-code pilot, not a remotely accessible member platform.** GitHub Apps, BNR, DigitalMe, Warden, RiverOS, any ERP/Tally connection, payments and financial settlement are **NOT CONNECTED**. No official identity, legal representation, custodial mandate or live operating authority has been established.

## Designed audience

| User | Plain-language labels | Available actions |
| --- | --- | --- |
| Business owner/requester | Workrooms, New work request, Waiting for partner | View assigned workspace, create requests |
| Business partner | Join this workroom, Accept / Decline, Mark completed | Accept invitation to a workroom and progress permitted tasks |
| Network office | Add organisation, Invite a member, Create workroom, Approve work | Locally provision synthetic participants, arrange scoped collaboration and approve submitted work |

Language selector: **English, Hindi, Kannada**. These are initial strings for field validation with real audiences, not certified translations. Synnergyze is intended to be a **universal workflow workspace**, not only an apparel application.

## Run locally (Node.js 22+)

Use a random, private, long bootstrap password that you create on your own computer; **do not paste it into chat or commits**. On Windows PowerShell:

    git switch feat/synnergyze-member-admission-sqlite-r06
    $env:SYNNERGYZE_MEMBER_PILOT = "1"
    $env:SYNNERGYZE_ADMIN_PASSWORD = Read-Host "Choose a local test office password (14+ characters)"
    node apps/synnergyze-member-r06/server.mjs

On Linux/macOS, set the same environment variables in a private shell. Never add them to Git tracked files.

Open **http://127.0.0.1:4178**. Sign in as username **office** using your chosen local password.

Initial setup:
1. Office creates two sample organisations: Business A and Business B.
2. Office creates one-time member invitation codes (valid for 24 hours). Copy codes privately and manually; no messages are sent.
3. Each sample member chooses a username and password via **Use invitation**, then signs in.
4. Office creates a workroom for both organisations.
5. Business B joins; Business A submits a work request; Business B accepts; Office approves; Business B completes.
6. The request remains in SQLite after server restart. Local session cookies expire after 12 hours.

The database is at **~/.synnergyze/member-pilot-r06.sqlite** unless you set **SYNNERGYZE_DB_FILE**. Back up only the expected pilot database when the server is stopped. The file and its write-ahead-log companion files may contain sensitive local demo data; do not sync/share them without explicit approval. On Windows, filesystem ACLs are governed by the OS account and require separate review.

The server refuses to start without \`SYNNERGYZE_MEMBER_PILOT=1\`, binds only to \`127.0.0.1\`, and is not to be exposed through port forwarding, tunnels, reverse proxies or Vercel. This is **not a production-grade authentication system**, even though local passwords and sessions exist.

## Controls and limitations

- SQLite persists organisations, registered local users, hashed passwords, invitation status, workrooms, requests, session records and synthetic event entries.
- Authentication uses scrypt-derived hashes and httpOnly SameSite Strict cookies. Mutations require a matching server-side CSRF token; the server checks the local HTTP origin and rate-limits failed logins.
- A one-time invitation records an intended organisation; it does not verify a real business, person's legal identity, consent, agency or appointment.
- The role and workroom checks are programmatic guards inside one server process. They are **not Warden signed decisions** or cryptographically verifiable DigitalMe membership.
- Event logs are synthetic hash-linked entries in the same database, **not tamper-resistant or RiverOS-issued evidence**. A privileged database owner can change both records and hashes.
- No real ERP, Tally, inventory, invoice, bank, wallet, Silk or other connector is invoked. API response marks \`externalEffects: false\`.
- Intended for one authorised laptop / developer workstation, not multiple users across remote devices or hostile networks.
- Database schema is proof-of-concept. There is no organisation owner self-service, invitation e-mail, password reset, MFA, durable backup policy, cryptographic River receipt, independent owner commissioning, disaster recovery or enterprise-grade audit guarantees.

## Test

    node --check apps/synnergyze-member-r06/server.mjs
    node --check apps/synnergyze-member-r06/public/app.js
    node --test apps/synnergyze-member-r06/member.node-check.mjs

The dedicated GitHub Actions workflow tests in temporary files; it does not provision live identities or modify external systems.

## Release gates and handover

Before a real network pilot, replace synthetic identity intake with BNR/DigitalMe, implement independent legal-entity representation and Warden authorisation, migrate to reviewed remote tenancy storage with durable backups, review web security/MFA/session lifecycle, add external RiverOS receipts, define audited ERP adapters, run independent UI/accessibility/localisation UAT, and obtain explicit approvals.

Review alongside [R0.5 draft PR #153](https://github.com/Believers-common-group/mcp-node-synnergyze/pull/153) and [Synnergyze governance draft PR #157](https://github.com/Believers-common-group/SynergyzeGovernance/pull/157). Do not merge, deploy or grant private repository access based solely on automated tests.
