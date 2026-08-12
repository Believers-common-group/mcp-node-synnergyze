# Technical Enforcement Matrix

**Companion to:** Open Contribution & Canonical Project Protection Policy v1.0  
**Status:** Proposed implementation plan  
**Objective:** Protect canonical project authority and resources without disturbing independent contributor projects.

## 1. Enforcement principle

Technical controls must attach to **privileged canonical effects**, not to ordinary repository use.

Independent forks, branches and derivative projects should continue wherever permitted by the applicable licence. Controls are introduced only where work crosses into canonical branches, project-funded execution, protected secrets, deployments, releases or official representation.

## 2. Current observed workflow baseline

The repository currently contains at least these project workflows on `main`:

### Datadog Synthetic tests
- Trigger: push to `main`
- Trigger: pull request targeting `main`
- Runner: `ubuntu-latest`
- Protected inputs referenced: `DD_API_KEY`, `DD_APP_KEY`
- Third-party action: DataDog synthetics CI action pinned to a commit SHA

### Node.js Package
- Trigger: release created
- Runner: `ubuntu-latest`
- Build before publish
- Protected input referenced: `npm_token`
- Publishing target: npm registry

These workflows are canonical-resource workflows and therefore require stronger controls than ordinary independent contributor CI.

## 3. Enforcement matrix

| Surface | Independent contributor/fork | Grace-period treatment | Canonical treatment after grace | Non-disruption rule |
|---|---|---|---|---|
| Read/clone public source | Continue | No change | Continue | Never blocked merely for policy non-acceptance |
| Independent fork | Continue | No change | Continue | No deletion or forced migration |
| Independent branch | Continue | No destructive action | Continue where permissions allow | Existing history preserved |
| PR to `main` | Allowed | Policy notice + normal checks | Acceptance/authority required for privileged admission where configured | Rejection/closure must not delete source branch/fork |
| Direct push to `main` | Avoid except explicit maintainers | Transition to protected path | Block except authorised bypass | Contributor work redirected to PR rather than destroyed |
| Canonical release | Restricted | Existing maintainers reviewed | Explicit release authority | Independent release remains independent and must not be represented as canonical |
| Repository secrets | Never implied by source access | Audit exposure paths | Protected; only trusted canonical workflows | Contributor source remains usable without secrets |
| Production/deployment credentials | Never implied | Audit and isolate | Explicit environment/deployment authority | Disable credential access, not contributor project |
| Paid/restricted runners | Never implied | Attribute usage | Explicit spending/execution authority | Fallback to contributor-owned resources where possible |
| Self-hosted runners | Never implied | Audit labels/groups | Restricted runner groups | No automatic access from public contribution paths |
| Package publishing token | Never implied | Audit release workflow | Protected release environment + authorised actor | Contributors can publish their own package identities separately |
| Third-party CI credentials | Never implied | Audit scopes/rotation | Protected environment/secret scope | Independent CI can use contributor-owned credentials |
| Workflow changes | Allowed in branches/PRs | Review required | CODEOWNERS/review boundary recommended | Do not stop independent workflow experiments outside canonical admission |
| Official project representation | Not implied | Notice distinction | Explicit authority | Preserve contributor attribution without conferring official status |

## 4. Recommended controls by priority

### P0 — Evidence first, no disruption

1. Inventory all workflows on canonical branches.
2. Record each workflow trigger, runner class, secrets, environment, external service and publishing/deployment effect.
3. Record who can currently merge to `main`, create releases and modify workflows.
4. Attribute current Actions usage by repository, workflow, run, job, actor and runner class before changing contributor access.
5. Preserve the pre-policy state as an evidence baseline.

### P1 — Protect canonical admission

1. Protect `main` from ordinary direct pushes.
2. Require pull requests for canonical admission.
3. Require applicable status checks before merge.
4. Prevent force-pushes and accidental branch deletion on protected canonical branches.
5. Keep an explicit, minimal bypass group for emergency maintainers.
6. Do not apply equivalent restrictions to unrelated contributor forks or independent branches unless separately justified.

### P1 — Protect workflow authority

1. Treat changes under `.github/workflows/**` as privileged canonical changes.
2. Require designated review for canonical workflow changes.
3. Prefer pinned third-party actions or otherwise governed dependency versions.
4. Avoid granting write/deployment authority to workflows that only need read/test capability.
5. Separate test workflows from release/deployment workflows.

### P1 — Protect secrets and credentials

1. Ensure fork-originated/untrusted contribution paths cannot receive production secrets.
2. Move deployment and publishing secrets to protected environments where practicable.
3. Scope secrets to the narrowest workflow/environment requiring them.
4. Rotate any credential found to have been exposed beyond its intended trust boundary.
5. Never place credentials directly in repository content or workflow logs.

### P1 — Protect spending authority

1. Define which runner classes may be paid from canonical project resources.
2. Restrict expensive/restricted/self-hosted runners to explicit trusted workflows and actors.
3. Add budget/usage observation and attributable reporting.
4. Do not charge historical ordinary use retrospectively under this policy.
5. Where contributors need heavy CI, allow independent execution using their own fork/resources without affecting canonical admission rights.

### P2 — Release and deployment separation

1. Treat release creation as privileged because it can trigger package publication.
2. Introduce a protected release environment before publishing where supported.
3. Require explicit authorised actor/reviewer for production or package-publish steps.
4. Keep ordinary CI independently runnable without publishing credentials.

### P2 — Contributor transition

1. Publish the policy and acceptance route.
2. Mark existing privileged contributors `GRACE` for the 30-day period.
3. Send courtesy reminder around day 15.
4. Send final reminder around day 25.
5. After day 30, convert non-accepting privileged participants to `INDEPENDENT` / `EXPIRED-GRACE` without deleting their permitted projects.

## 5. Current repository-specific observations

### Datadog workflow

Because the Datadog workflow runs both on pull requests targeting `main` and again on pushes to `main`, a successfully merged contribution can result in validation before merge and another canonical run after merge. This may be intentional, but it should be reviewed for cost and operational necessity.

The workflow references Datadog API/application secrets, so its security boundary is more consequential than a plain compile/test workflow.

**Recommended treatment:** do not disable it merely because contributors exist. Instead, determine whether PR validation can run safely without protected production credentials and whether the post-merge run remains necessary.

### npm publication workflow

The package workflow runs only on release creation and publishes using `npm_token` after a build/test stage.

**Recommended treatment:** preserve independent build/test capability, but treat release creation and package publishing as privileged canonical actions. Publishing credentials should not be available merely because someone can contribute code.

## 6. Grace-period operating rule

During the grace period:

- do not delete existing contributor branches or forks;
- do not force contributors to migrate independent projects;
- do not interrupt ordinary read/clone/fork use;
- do not retrospectively bill ordinary prior usage under this policy;
- do begin protecting canonical credentials, deployment/release authority and spending boundaries where exposure creates immediate risk;
- where a privileged path must be closed, provide a non-privileged alternative path where reasonably possible.

## 7. Emergency exception

An active credential leak, malicious workflow, destructive operation, compromised account or material threat to protected infrastructure may be contained immediately. Containment must be scoped to the affected privilege/resource wherever possible and must not be used as a pretext to destroy unrelated contributor work.

## 8. Implementation sequence

**DISCOVER → ATTRIBUTE → BASELINE → NOTIFY → PROTECT CANONICAL BOUNDARY → ISOLATE SECRETS/PAID EXECUTION → REVIEW RELEASE AUTHORITY → OBSERVE → ENFORCE AFTER GRACE → AUDIT**

No destructive enforcement step should precede discovery and attribution unless required for immediate security containment.
