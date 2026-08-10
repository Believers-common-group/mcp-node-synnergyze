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

## 6. Evidence classes

Each future attribution record should distinguish:

- **FACT** — directly observed from GitHub repository/workflow/run metadata;
- **DERIVED** — mechanically calculated from observed facts, such as duration or repeated-run grouping;
- **INFERRED** — suspected cause or relationship requiring verification.

No enforcement decision should be based solely on an `INFERRED` attribution where direct run-level evidence is reasonably obtainable.

## 7. Required next evidence

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

## 8. Non-disruption rule

Attribution is observational. It does not itself revoke access, delete branches, stop forks, close projects, demand payment, or alter repository history.

Any later technical control must attach to the minimum necessary privileged boundary and preserve unrelated independent work wherever reasonably possible.
