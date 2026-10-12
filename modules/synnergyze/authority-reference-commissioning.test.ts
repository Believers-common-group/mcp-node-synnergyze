import { describe, it, expect } from "vitest";
import { assessReferenceCommissioningV1 } from "./authority-reference-commissioning.ts";

const candidate = () => ({
  schema: "AUTHORITY-REFERENCE-COMMISSIONING-EVIDENCE-001/R1.0",
  request: {
    integrationRef: "AUTHORITY-REFERENCE-CONTRACT-001/R1.0",
    repository: "Believers-common-group/mcp-node-synnergyze",
    sourceBranch: "integration/authority-reference-r09-preview-20261012",
    sourceCommitSha: "da3322f8a5e570f9a2af77c441a3a8a0587198a4",
    environment: "STAGING_REVIEW",
    capability: "authority_reference.retrieve_public",
  },
  observed: {
    projectId: "prj_0hfVI5ZLeRLdtGJKFT3m1xlTjs1K",
    projectName: "synnergyze-genesis-mcp",
    linkedRepository: "Believers-common-group/mcp-node-synnergyze",
    deploymentBranchPolicy: { allowOnly: "genesis", source: "REPOSITORY_VERCEL_JSON" },
    latestDeployment: { id: "dpl_D37e2y7wKptEUZs8qW78BkumzTkt", state: "CANCELED",
      branch: "estate-console-v0.1", commitSha: "1145c4c671d18f1da08156659443fbbc3477cd10",
      target: null as "production" | "preview" | null },
    lastReadyDeployment: { id: "dpl_hnRgdWSK3Z41h6YQKZzuiEGEbUT7", state: "READY",
      branch: "genesis", commitSha: "6c5192964c9af002daf09bdb5c1e78424db281a2",
      target: "production" as "production" | "preview" | null },
  },
});
const assess = (c: unknown) => assessReferenceCommissioningV1(c);

describe("R1.0 fail-closed runtime commissioning preflight", () => {
  it("distinguishes a blocked R0.9 deployment from an older READY build", () => {
    const v = assess(candidate());
    expect(v.state).toBe("HOLD");
    expect(v.deployPermitted).toBe(false);
    expect(v.reasons).toContain("SOURCE_BRANCH_SKIPPED_BY_DEPLOYMENT_POLICY");
    expect(v.reasons).toContain("LATEST_DEPLOYMENT_NOT_READY");
    expect(v.reasons).toContain("HISTORICAL_READY_IS_NOT_CANDIDATE_PROVENANCE");
  });
  it("holds even if the source and READY deployment match", () => {
    const c = candidate();
    c.request.sourceBranch = "genesis";
    c.request.sourceCommitSha = c.observed.lastReadyDeployment.commitSha;
    c.observed.latestDeployment = { ...c.observed.lastReadyDeployment };
    const v = assess(c);
    expect(v.checks.candidate_deployment).toBe("PASS");
    expect(v.state).toBe("HOLD");
    expect(v.runtimeInvocationPermitted).toBe(false);
    expect(v.reasons).toContain("LIVE_RIVER_ADMISSION_RECEIPT_UNVERIFIED");
  });
  it("rejects malformed input", () => {
    for (const input of [null, {}, "invalid", { schema: "other" }])
      expect(assess(input).reasons).toContain("INVALID_EVIDENCE_ENVELOPE");
  });
  it("rejects unadmitted capabilities", () => {
    const c = candidate();c.request.capability = "authority_reference.publish";
    expect(assess(c).reasons).toContain("REQUEST_SCOPE_OR_SHA_INVALID");
  });
  it("rejects requests for production", () => {
    const c = candidate();(c.request as { environment: string }).environment = "PRODUCTION";
    expect(assess(c).reasons).toContain("REQUEST_SCOPE_OR_SHA_INVALID");
  });
  it("rejects incorrect GitHub repository", () => {
    const c = candidate();c.observed.linkedRepository = "unknown/repository";
    expect(assess(c).reasons).toContain("VERCEL_PROJECT_REPOSITORY_MISMATCH");
  });
  it("rejects missing deployment metadata", () => {
    const c = candidate();(c.observed as {latestDeployment: unknown}).latestDeployment = null;
    (c.observed as {lastReadyDeployment: unknown}).lastReadyDeployment = null;
    const v = assess(c);
    expect(v.reasons).toContain("LATEST_DEPLOYMENT_NOT_OBSERVED");
    expect(v.reasons).toContain("HISTORICAL_READY_DEPLOYMENT_NOT_OBSERVED");
  });
  it("rejects an unverified deployment branch policy", () => {
    const c = candidate();(c.observed.deploymentBranchPolicy as {allowOnly:string}).allowOnly = "any";
    expect(assess(c).reasons).toContain("BRANCH_POLICY_UNVERIFIED");
  });
  it("rejects a canceled build of the exact requested commit", () => {
    const c = candidate();c.observed.latestDeployment.branch=c.request.sourceBranch;
    c.observed.latestDeployment.commitSha=c.request.sourceCommitSha;
    expect(assess(c).reasons).toContain("CANDIDATE_DEPLOYMENT_NOT_READY");
  });
  it("ignores caller claims of external approvals and keeps all authority outputs false", () => {
    const v = assess({ ...candidate(), wardenApproved:true, riverReceiptVerified:true, productionApproved:true });
    expect(v.authorityAdmitted).toBe(false);
    expect(v.admissionReceiptVerified).toBe(false);
    expect(v.executionReceiptVerified).toBe(false);
    expect(v.sourceRetrievalPermitted).toBe(false);
  });
  it("does not mutate input and creates a stable digest", () => {
    const c=candidate(),saved=structuredClone(c);
    expect(assess(c).sourceEvidenceDigest).toBe(assess(c).sourceEvidenceDigest);
    expect(c).toEqual(saved);
  });
});