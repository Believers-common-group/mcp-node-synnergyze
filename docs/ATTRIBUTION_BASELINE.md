# Attribution Baseline

**Repository:** `Believers-common-group/mcp-node-synnergyze`  
**Baseline date:** 10 August 2026  
**Status:** Initial verified snapshot; incomplete by design pending full Actions/run inventory.

## 1. Purpose

This file records verified facts before technical enforcement changes are applied. It is intended to support accountability without disturbing independent projects or assuming wrongdoing.

## 2. Canonical repository baseline

- Default branch: `main`.
- Separate branch observed: `genesis`.
- Policy work is isolated on `policy/open-contribution-canonical-protection-v1` and proposed through PR #17.

## 3. Verified workflow baseline on `main`

### Datadog Synthetic tests

- Path: `.github/workflows/datadog-synthetics.yml`
- Triggers:
  - push to `main`
  - pull request targeting `main`
- Runner: `ubuntu-latest`
- Protected inputs referenced:
  - `DD_API_KEY`
  - `DD_APP_KEY`
- External action: DataDog Synthetics CI action pinned to a commit SHA.

### Node.js Package

- Path: `.github/workflows/npm-publish.yml`
- Trigger: release created
- Runner: `ubuntu-latest`
- Build/test occurs before publish
- Protected input referenced: `npm_token`
- Publishing target: npm registry

## 4. Verified permission observations

Permission checks performed against this repository currently show:

- `Esomoire-consultancy-Company`: `admin`
- `Faiz-Ahmed`: `read`
- `github-actions[bot]`: no repository collaborator permission returned
- `dependabot[bot]`: no repository collaborator permission returned

These observations are not a complete collaborator inventory and must not be interpreted as such.

## 5. Current attribution findings

The verified workflows above use Linux (`ubuntu-latest`) only. Therefore, these two workflow definitions do not by themselves explain any macOS or Windows runner usage observed in billing.

The Datadog workflow can execute once during pull-request validation and again after a merge causes a push to `main`. This may be intentional and is not classified as waste without run-level evidence.

The npm publication workflow is privileged because release creation can progress into package publication using a protected token.

## 6. First verified run-level attribution — PR #17

Creating the policy PR itself produced four pull-request-triggered workflow runs associated with commit `fbfb3047cfa35e843b9c802b58b32fb1ac02b30e`:

| Workflow | Run ID | Job ID | Result | Verified runner |
|---|---:|---:|---|---|
| Run Datadog Synthetic tests | 31363227612 | 93376159514 | failure | Ubuntu 24.04 / `ubuntu-24.04` |
| test | 31363227683 | 93376160017 | success | Ubuntu 24.04 / `ubuntu-24.04` |
| type-check | 31363227659 | 93376159841 | success | Ubuntu 24.04 / `ubuntu-24.04` |
| lint | 31363227627 | 93376159747 | success | Ubuntu 24.04 / `ubuntu-24.04` |

This proves that a single PR can fan out into multiple independent Actions runs even when the proposed change is documentation/policy-only.

### Datadog failure cause

The Datadog job failed at the Datadog Synthetic tests step because the required Datadog API/application key inputs were not supplied to that PR run. The log reports `Missing API or APP keys to initialize datadog-ci!` and `Input required and not supplied: api_key`.

The failure occurred after the Ubuntu hosted runner had already been provisioned and the checkout/Datadog actions had been downloaded. Therefore, even a fast missing-secret failure can still create Actions execution and billing/usage evidence.

This is a configuration-boundary issue, not evidence of contributor misconduct.

### Other verified PR checks

The `test`, `type-check`, and `lint` runs completed successfully on Ubuntu hosted runners. Their logs show read-only GitHub token permissions for contents/metadata/packages. The test and type-check workflows each installed the project dependencies before performing their designated check; the test job reported 26 passing tests.

The dependency installation output also reported 26 npm audit findings (3 low, 3 moderate, 17 high, 3 critical). This is a separate dependency-security observation and must not be conflated with runner billing or contributor accountability.

### Attribution lesson

The policy PR provides a concrete example of why accountability must distinguish:

`ACTOR/CHANGE → PR → MULTIPLE WORKFLOW RUNS → JOBS → RUNNER MINUTES → RESULT`

A contributor should be accountable for the attributable trigger/change, while project maintainers remain accountable for canonical workflow design, secret availability rules, runner selection, and whether particular checks should execute for that class of change.

## 7. Evidence classes

Each future attribution record should distinguish:

- **FACT** — directly observed from GitHub repository/workflow/run metadata;
- **DERIVED** — mechanically calculated from observed facts, such as duration or repeated-run grouping;
- **INFERRED** — suspected cause or relationship requiring verification.

No enforcement decision should be based solely on an `INFERRED` attribution where direct run-level evidence is reasonably obtainable.

## 8. Required next evidence

The next evidence set should identify, where connector/API coverage allows:

1. workflow runs during the relevant billing interval;
2. workflow/run/job identifiers;
3. branch/ref and commit SHA;
4. actor or trigger source;
5. runner OS/class;
6. job start/end/duration;
7. success/failure/cancelled state;
8. repeat/rerun relationship;
9. protected environment, release, publishing or deployment effects; and
10. whether the activity belongs to canonical work or an independent contributor project.

Until that evidence is available, no contributor project should be blamed for the macOS/Linux billing changes.

## 9. Non-disruption rule

Attribution is observational. It does not itself revoke access, delete branches, stop forks, close projects, demand payment, or alter repository history.

Any later technical control must attach to the minimum necessary privileged boundary and preserve unrelated independent work wherever reasonably possible.
