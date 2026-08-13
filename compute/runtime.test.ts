import { describe, expect, it } from "vitest";

import {
  ComputeEvidenceJournal,
  GovernedComputeCoordinator,
  SyntheticCpuComputeRunner,
  makeSyntheticComputeGrant,
  makeSyntheticComputeIntent,
} from "./runtime.ts";

const FIXED_NOW = Date.parse("2026-08-13T07:00:00.000Z");

describe("ALPHA-NODE-001 governed compute proof", () => {
  it("executes only after Warden grant, runner enrollment and evidence reservation", () => {
    const evidence = new ComputeEvidenceJournal();
    const coordinator = new GovernedComputeCoordinator(evidence, () => FIXED_NOW);
    const runner = new SyntheticCpuComputeRunner();
    coordinator.registerRunner(runner);

    const intent = makeSyntheticComputeIntent("COMPUTE-PROOF-ALLOW-001");
    const grant = makeSyntheticComputeGrant(intent);
    const result = coordinator.attempt(intent, grant);

    expect(result.status).toBe("VERIFIED");
    expect(result.realWorldEffectOccurred).toBe(false);
    expect(result.result?.values).toEqual([19, 22, 43, 50]);
    expect(result.result?.sha256).toMatch(/^[a-f0-9]{64}$/);

    const journal = evidence.list();
    expect(journal.map((entry) => entry.stage)).toEqual(["RESERVED", "SEALED"]);
    expect(journal[0]?.wardenGrantRef).toBe(grant.grantRef);
    expect(journal[1]?.resultHash).toBe(result.result?.sha256);
  });

  it("blocks execution when the Warden compute grant is missing", () => {
    const evidence = new ComputeEvidenceJournal();
    const coordinator = new GovernedComputeCoordinator(evidence, () => FIXED_NOW);
    coordinator.registerRunner(new SyntheticCpuComputeRunner());

    const intent = makeSyntheticComputeIntent("COMPUTE-PROOF-NO-GRANT-001");
    const result = coordinator.attempt(intent);

    expect(result.status).toBe("BLOCKED_REQUIREMENT");
    expect(result.reason).toBe("warden_compute_grant_missing");
    expect(result.result).toBeUndefined();
    expect(evidence.list()).toHaveLength(1);
    expect(evidence.list()[0]?.stage).toBe("DENIED");
  });

  it("denies a provider substitution not explicitly covered by the grant", () => {
    const evidence = new ComputeEvidenceJournal();
    const coordinator = new GovernedComputeCoordinator(evidence, () => FIXED_NOW);
    coordinator.registerRunner(new SyntheticCpuComputeRunner());

    const intent = makeSyntheticComputeIntent("COMPUTE-PROOF-PROVIDER-001");
    const grant = makeSyntheticComputeGrant(intent);
    const substitutedIntent = { ...intent, provider: "apple-mpp-local" as const };

    const result = coordinator.attempt(substitutedIntent, grant);

    expect(result.status).toBe("DENIED");
    expect(result.reason).toBe("grant_provider_mismatch");
    expect(result.result).toBeUndefined();
  });

  it("does not treat an Apple MPP capability declaration as an executable runner", () => {
    const evidence = new ComputeEvidenceJournal();
    const coordinator = new GovernedComputeCoordinator(evidence, () => FIXED_NOW);

    const base = makeSyntheticComputeIntent("COMPUTE-PROOF-MPP-NOT-ENROLLED-001");
    const intent = {
      ...base,
      provider: "apple-mpp-local" as const,
      runnerId: "GENESIS-APPLE-RUNNER-001",
    };
    const grant = makeSyntheticComputeGrant(intent);

    const result = coordinator.attempt(intent, grant);

    expect(result.status).toBe("UNAVAILABLE");
    expect(result.reason).toBe("runner_not_registered");
    expect(result.result).toBeUndefined();
  });

  it("rejects expired compute grants before evidence reservation or execution", () => {
    const evidence = new ComputeEvidenceJournal();
    const coordinator = new GovernedComputeCoordinator(evidence, () => FIXED_NOW);
    coordinator.registerRunner(new SyntheticCpuComputeRunner());

    const intent = makeSyntheticComputeIntent("COMPUTE-PROOF-EXPIRED-001");
    const grant = {
      ...makeSyntheticComputeGrant(intent),
      issuedAt: "2026-08-13T04:00:00.000Z",
      expiresAt: "2026-08-13T05:00:00.000Z",
    };

    const result = coordinator.attempt(intent, grant);

    expect(result.status).toBe("DENIED");
    expect(result.reason).toBe("grant_expired");
    expect(result.result).toBeUndefined();
    expect(evidence.list().map((entry) => entry.stage)).toEqual(["DENIED"]);
  });

  it("denies an intent whose principal differs from the Warden grant", () => {
    const evidence = new ComputeEvidenceJournal();
    const coordinator = new GovernedComputeCoordinator(evidence, () => FIXED_NOW);
    coordinator.registerRunner(new SyntheticCpuComputeRunner());

    const intent = makeSyntheticComputeIntent("COMPUTE-PROOF-PRINCIPAL-001");
    const grant = makeSyntheticComputeGrant(intent);
    const changedIntent = { ...intent, principalRef: "DIGITALME-OTHER-001" };

    const result = coordinator.attempt(changedIntent, grant);

    expect(result.status).toBe("DENIED");
    expect(result.reason).toBe("grant_principal_mismatch");
  });
});
