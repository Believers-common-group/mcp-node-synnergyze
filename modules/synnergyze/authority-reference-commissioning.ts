import { createHash } from "node:crypto";

/**
 * R1.0 source-only commissioning evidence preflight.
 * It cannot deploy, call Warden, consume permits, retrieve sources, or issue River receipts.
 * A source commit, a READY deployment, and authorised operation are different facts.
 */
export type CommissioningCheck = "PASS" | "BLOCKED" | "UNVERIFIED";
export type ObservedDeploymentState = "READY" | "CANCELED" | "ERROR" | "BUILDING" | "QUEUED" | "BLOCKED" | "UNKNOWN";
export interface ReferenceCommissioningEvidenceV1 {
  schema: "AUTHORITY-REFERENCE-COMMISSIONING-EVIDENCE-001/R1.0";
  request: {
    integrationRef: string;
    repository: string;
    sourceBranch: string;
    sourceCommitSha: string;
    environment: "STAGING_REVIEW";
    capability: string;
  };
  observed: {
    projectId: string;
    projectName: string;
    linkedRepository: string;
    deploymentBranchPolicy: { allowOnly: "genesis"; source: "REPOSITORY_VERCEL_JSON" };
    latestDeployment: {
      id: string; state: ObservedDeploymentState; branch: string; commitSha: string;
      target: "production" | "preview" | null;
    } | null;
    lastReadyDeployment: {
      id: string; state: ObservedDeploymentState; branch: string; commitSha: string;
      target: "production" | "preview" | null;
    } | null;
  };
}
export interface ReferenceCommissioningAssessmentV1 {
  schema: "AUTHORITY-REFERENCE-COMMISSIONING-ASSESSMENT-001/R1.0";
  state: "HOLD";
  deployPermitted: false; runtimeInvocationPermitted: false; authorityAdmitted: false;
  sourceRetrievalPermitted: false; admissionReceiptVerified: false;
  executionReceiptVerified: false; sourceEvidenceDigest: string | null;
  checks: Record<string, CommissioningCheck>; reasons: string[];
}
const SHA = /^[a-f0-9]{40}$/i;
const CAPABILITIES = new Set(["authority_reference.discover", "authority_reference.retrieve_public",
  "authority_reference.verify", "authority_reference.reference"]);
const isObject = (x: unknown): x is Record<string, unknown> =>
  x !== null && typeof x === "object" && !Array.isArray(x);
const nonempty = (x: unknown): x is string =>
  typeof x === "string" && x.length > 0 && x.trim() === x;
function digest(value: unknown): string | null {
  try {
    const stable = (x: unknown): unknown => Array.isArray(x) ? x.map(stable) :
      isObject(x) ? Object.fromEntries(Object.entries(x).sort(([a],[b]) => a.localeCompare(b))
        .map(([k,n]) => [k,stable(n)])) : x;
    return "sha256:" + createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
  } catch { return null; }
}
export function assessReferenceCommissioningV1(input: unknown): ReferenceCommissioningAssessmentV1 {
  const checks: Record<string, CommissioningCheck> = {};
  const reasons: string[] = [];
  const block = (key: string, reason: string) => { checks[key] = "BLOCKED"; reasons.push(reason); };
  const unverified = (key: string, reason: string) => { checks[key] = "UNVERIFIED"; reasons.push(reason); };
  const pass = (key: string) => { checks[key] = "PASS"; };
  const finish = (sourceEvidenceDigest: string | null): ReferenceCommissioningAssessmentV1 => ({
    schema: "AUTHORITY-REFERENCE-COMMISSIONING-ASSESSMENT-001/R1.0",
    state: "HOLD", deployPermitted: false, runtimeInvocationPermitted: false,
    authorityAdmitted: false, sourceRetrievalPermitted: false,
    admissionReceiptVerified: false, executionReceiptVerified: false,
    sourceEvidenceDigest, checks, reasons,
  });
  if (!isObject(input) || input.schema !== "AUTHORITY-REFERENCE-COMMISSIONING-EVIDENCE-001/R1.0" ||
      !isObject(input.request) || !isObject(input.observed)) {
    block("evidence_schema", "INVALID_EVIDENCE_ENVELOPE");
    unverified("independent_authority", "NO_INDEPENDENT_AUTHORITY_VERIFICATION");
    return finish(null);
  }
  const req = input.request, obs = input.observed, sourceEvidenceDigest = digest(input);
  const validRequest = nonempty(req.integrationRef) && nonempty(req.repository) &&
    nonempty(req.sourceBranch) && typeof req.sourceCommitSha === "string" &&
    SHA.test(req.sourceCommitSha) && req.environment === "STAGING_REVIEW" &&
    CAPABILITIES.has(req.capability as string);
  if (!validRequest) block("candidate_identity", "REQUEST_SCOPE_OR_SHA_INVALID");
  else pass("candidate_identity");

  const projectMatches = nonempty(obs.projectId) && obs.projectName === "synnergyze-genesis-mcp" &&
    obs.linkedRepository === req.repository;
  if (!projectMatches) block("vercel_project_binding", "VERCEL_PROJECT_REPOSITORY_MISMATCH");
  else pass("vercel_project_binding");

  const policy = isObject(obs.deploymentBranchPolicy) &&
    obs.deploymentBranchPolicy.source === "REPOSITORY_VERCEL_JSON" &&
    obs.deploymentBranchPolicy.allowOnly === "genesis";
  if (!policy) block("branch_policy", "BRANCH_POLICY_UNVERIFIED");
  else if (req.sourceBranch !== "genesis") block("branch_policy", "SOURCE_BRANCH_SKIPPED_BY_DEPLOYMENT_POLICY");
  else pass("branch_policy");

  const latest = isObject(obs.latestDeployment) ? obs.latestDeployment : null;
  const ready = isObject(obs.lastReadyDeployment) ? obs.lastReadyDeployment : null;
  if (!latest || !nonempty(latest.id)) unverified("latest_deployment", "LATEST_DEPLOYMENT_NOT_OBSERVED");
  else if (latest.state !== "READY") block("latest_deployment", "LATEST_DEPLOYMENT_NOT_READY");
  else pass("latest_deployment");

  if (!latest || latest.branch !== req.sourceBranch || latest.commitSha !== req.sourceCommitSha)
    block("candidate_deployment", "CANDIDATE_COMMIT_NOT_OBSERVED_AS_LATEST_DEPLOYMENT");
  else if (latest.state !== "READY")
    block("candidate_deployment", "CANDIDATE_DEPLOYMENT_NOT_READY");
  else pass("candidate_deployment");

  if (!ready || ready.state !== "READY" || !nonempty(ready.id) ||
      typeof ready.commitSha !== "string" || !SHA.test(ready.commitSha))
    unverified("historical_ready_deployment", "HISTORICAL_READY_DEPLOYMENT_NOT_OBSERVED");
  else if (ready.branch !== req.sourceBranch || ready.commitSha !== req.sourceCommitSha) {
    pass("historical_ready_deployment");
    reasons.push("HISTORICAL_READY_IS_NOT_CANDIDATE_PROVENANCE");
  } else pass("historical_ready_deployment");

  unverified("signed_worker_build", "INDEPENDENT_SIGNED_BUILD_AND_RUNNING_WORKER_UNVERIFIED");
  unverified("digitalme", "TRUSTED_DIGITALME_DELEGATION_UNVERIFIED");
  unverified("warden", "SIGNED_WARDEN_ADMISSION_AND_REVOCATION_UNVERIFIED");
  unverified("river_admission", "LIVE_RIVER_ADMISSION_RECEIPT_UNVERIFIED");
  unverified("one_time_permit", "TRUSTED_SINGLE_USE_PERMIT_CONSUMPTION_UNVERIFIED");
  unverified("source_egress", "OFFICIAL_SOURCE_EGRESS_NOT_ADMITTED");
  unverified("river_execution", "LIVE_RIVER_EXECUTION_RECEIPT_UNVERIFIED");
  unverified("go_live", "SEPARATE_PRODUCTION_COMMISSIONING_APPROVAL_REQUIRED");
  return finish(sourceEvidenceDigest);
}