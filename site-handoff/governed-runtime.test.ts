import { describe, expect, it } from "vitest";

import {
  executeGovernedSiteHandoffV2,
  InMemoryHandoffExecutionJournalV1,
  InMemoryHmacHandoffKeyringV1,
  issueGovernedHandoffGrantV2,
  type DestinationSessionGatewayV1,
  type DestinationSessionReceiptV1,
  type HandoffClaimsV2,
  type HandoffPostDeploymentVerifierV1,
  type RiverHandoffEvidenceGatewayV1,
  type VerifiedWardenHandoffGrantV1,
  type WardenHandoffGrantVerifierV1,
} from "./governed-runtime.ts";

const NOW = Date.parse("2026-08-15T07:00:00.000Z");
const SECRET = "alpha-handoff-conformance-secret-000000000000000001";

function grant(overrides: Partial<VerifiedWardenHandoffGrantV1> = {}): VerifiedWardenHandoffGrantV1 {
  return {
    grantRef: "WARDEN-GRANT:HANDOFF-001",
    decisionRef: "WARDEN-DECISION:HANDOFF-001",
    evidenceRef: "RIVER-EVIDENCE:WARDEN-GRANT-001",
    outcome: "ALLOW",
    actorRef: "DIGITALME-ALPHA-001",
    digitalMeRef: "DIGITALME-ALPHA-001",
    sourceSite: "BC",
    destinationSite: "VSR",
    capabilityRefs: ["program:read", "evidence:submit"],
    validFrom: "2026-08-15T06:59:00.000Z",
    validUntil: "2026-08-15T07:05:00.000Z",
    ...overrides,
  };
}

class StaticWardenVerifier implements WardenHandoffGrantVerifierV1 {
  count = 0;
  constructor(private readonly value: VerifiedWardenHandoffGrantV1) {}

  async verify(grantRef: string): Promise<VerifiedWardenHandoffGrantV1> {
    this.count += 1;
    if (grantRef !== this.value.grantRef) throw new Error("warden_grant_not_found");
    return { ...this.value, capabilityRefs: [...this.value.capabilityRefs] };
  }
}

class RecordingRiver implements RiverHandoffEvidenceGatewayV1 {
  calls: string[] = [];
  async reserve(input: { handoffRef: string }) {
    this.calls.push(`reserve:${input.handoffRef}`);
    return { reservationRef: `RIVER-RESERVATION:${input.handoffRef}`, state: "RESERVED" as const };
  }
  async seal(input: { reservationRef: string; sessionRef: string }) {
    this.calls.push(`seal:${input.reservationRef}:${input.sessionRef}`);
    return { sealRef: `RIVER-SEAL:${input.sessionRef}`, state: "SEALED" as const };
  }
  async sealException(input: { reservationRef: string; reason: string }) {
    this.calls.push(`seal-exception:${input.reservationRef}:${input.reason}`);
    return { sealRef: `RIVER-EXCEPTION-SEAL:${input.reservationRef}`, state: "SEALED" as const };
  }
}

class RecordingDestination implements DestinationSessionGatewayV1 {
  calls = 0;
  async openSession(input: {
    handoffRef: string;
    reservationRef: string;
    claims: HandoffClaimsV2;
    roles: readonly string[];
    idempotencyKey: string;
    createdAt: string;
  }): Promise<DestinationSessionReceiptV1> {
    this.calls += 1;
    return {
      sessionRef: "DESTINATION-SESSION:001",
      digitalMeRef: input.claims.digitalme_id,
      audience: input.claims.dst,
      capabilityRefs: [...input.claims.capabilities],
      createdAt: input.createdAt,
      providerSessionRef: "SYNTHETIC-PROVIDER-SESSION:001",
    };
  }
}

class ExactSessionVerifier implements HandoffPostDeploymentVerifierV1 {
  calls = 0;
  constructor(private readonly forceFailure = false) {}

  async verify(input: {
    handoffRef: string;
    claims: HandoffClaimsV2;
    session: DestinationSessionReceiptV1;
    checkedAt: string;
  }) {
    this.calls += 1;
    const expectedCaps = [...input.claims.capabilities].sort();
    const actualCaps = [...input.session.capabilityRefs].sort();
    const matches =
      !this.forceFailure &&
      input.session.digitalMeRef === input.claims.digitalme_id &&
      input.session.audience === input.claims.dst &&
      JSON.stringify(actualCaps) === JSON.stringify(expectedCaps);
    return {
      verified: matches,
      evidenceRef: matches ? "POST-DEPLOYMENT-EVIDENCE:001" : "POST-DEPLOYMENT-EVIDENCE:FAILED",
      checkedAt: input.checkedAt,
      reason: matches ? undefined : "destination_session_mismatch",
    };
  }
}

async function issued(overrides: Partial<VerifiedWardenHandoffGrantV1> = {}) {
  const verifier = new StaticWardenVerifier(grant(overrides));
  const keyring = new InMemoryHmacHandoffKeyringV1("HANDOFF-KEY:001", SECRET);
  const token = await issueGovernedHandoffGrantV2(
    {
      issuer: "ALPHA-HANDOFF-ISSUER-001",
      actorRef: "DIGITALME-ALPHA-001",
      digitalMeRef: "DIGITALME-ALPHA-001",
      sourceSite: "BC",
      destinationSite: "VSR",
      capabilities: ["evidence:submit", "program:read"],
      wardenGrantRef: "WARDEN-GRANT:HANDOFF-001",
      ttlSeconds: 120,
      nowMs: NOW,
    },
    { wardenVerifier: verifier, signer: keyring },
  );
  return { token, verifier, keyring };
}

describe("B-010 governed site handoff v2", () => {
  it("requires a verified Warden grant before token issuance", async () => {
    const verifier = new StaticWardenVerifier(grant({ destinationSite: "CC" }));
    const keyring = new InMemoryHmacHandoffKeyringV1("HANDOFF-KEY:001", SECRET);
    await expect(
      issueGovernedHandoffGrantV2(
        {
          issuer: "ALPHA-HANDOFF-ISSUER-001",
          actorRef: "DIGITALME-ALPHA-001",
          digitalMeRef: "DIGITALME-ALPHA-001",
          sourceSite: "BC",
          destinationSite: "VSR",
          capabilities: ["program:read"],
          wardenGrantRef: "WARDEN-GRANT:HANDOFF-001",
          nowMs: NOW,
        },
        { wardenVerifier: verifier, signer: keyring },
      ),
    ).rejects.toThrow("handoff_warden_destination_mismatch");
  });

  it("binds the signing key reference into the token header and rejects tampering", async () => {
    const { token, keyring } = await issued();
    expect(token.keyRef).toBe("HANDOFF-KEY:001");
    const parts = token.token.split(".");
    const tampered = `${parts[0]}.${parts[1]}.${parts[2].slice(0, -1)}x`;
    const journal = new InMemoryHandoffExecutionJournalV1();

    await expect(
      executeGovernedSiteHandoffV2({
        token: tampered,
        expectedDestination: "VSR",
        signatureVerifier: keyring,
        wardenVerifier: new StaticWardenVerifier(grant()),
        journal,
        river: new RecordingRiver(),
        destination: new RecordingDestination(),
        postDeploymentVerifier: new ExactSessionVerifier(),
        nowMs: NOW + 1_000,
      }),
    ).rejects.toThrow("handoff_token_signature_invalid");
    expect(journal.size()).toBe(0);
  });

  it("executes the governed sequence Warden -> journal -> River reserve -> session -> verify -> River seal", async () => {
    const { token, keyring } = await issued();
    const warden = new StaticWardenVerifier(grant());
    const journal = new InMemoryHandoffExecutionJournalV1();
    const river = new RecordingRiver();
    const destination = new RecordingDestination();
    const post = new ExactSessionVerifier();

    const result = await executeGovernedSiteHandoffV2({
      token: token.token,
      expectedDestination: "VSR",
      signatureVerifier: keyring,
      wardenVerifier: warden,
      journal,
      river,
      destination,
      postDeploymentVerifier: post,
      nowMs: NOW + 1_000,
    });

    expect(result.state).toBe("HANDOFF_VERIFIED");
    expect(result.activationImplied).toBe(false);
    expect(result.destinationSite).toBe("VSR");
    expect(result.capabilityRefs).toEqual(["evidence:submit", "program:read"]);
    expect(result.roleRefs).toEqual(["VSR_EVIDENCE_CONTRIBUTOR", "VSR_VIEWER"]);
    expect(result.wardenGrantRef).toBe("WARDEN-GRANT:HANDOFF-001");
    expect(result.wardenDecisionRef).toBe("WARDEN-DECISION:HANDOFF-001");
    expect(result.wardenEvidenceRef).toBe("RIVER-EVIDENCE:WARDEN-GRANT-001");
    expect(result.reservationRef).toMatch(/^RIVER-RESERVATION:/);
    expect(result.destinationSessionRef).toBe("DESTINATION-SESSION:001");
    expect(result.destinationVerificationEvidenceRef).toBe("POST-DEPLOYMENT-EVIDENCE:001");
    expect(result.riverSealRef).toBe("RIVER-SEAL:DESTINATION-SESSION:001");
    expect(destination.calls).toBe(1);
    expect(post.calls).toBe(1);
    expect(river.calls[0]).toMatch(/^reserve:/);
    expect(river.calls[1]).toMatch(/^seal:/);
  });

  it("returns the completed result idempotently without opening a second destination session", async () => {
    const { token, keyring } = await issued();
    const warden = new StaticWardenVerifier(grant());
    const journal = new InMemoryHandoffExecutionJournalV1();
    const river = new RecordingRiver();
    const destination = new RecordingDestination();
    const post = new ExactSessionVerifier();
    const input = {
      token: token.token,
      expectedDestination: "VSR" as const,
      signatureVerifier: keyring,
      wardenVerifier: warden,
      journal,
      river,
      destination,
      postDeploymentVerifier: post,
      nowMs: NOW + 1_000,
    };

    const first = await executeGovernedSiteHandoffV2(input);
    const second = await executeGovernedSiteHandoffV2(input);

    expect(second.handoffRef).toBe(first.handoffRef);
    expect(second.riverSealRef).toBe(first.riverSealRef);
    expect(second.idempotentReplay).toBe(true);
    expect(destination.calls).toBe(1);
    expect(post.calls).toBe(1);
    expect(river.calls.filter((call) => call.startsWith("reserve:")).length).toBe(1);
  });

  it("fails closed and seals exception evidence when destination verification fails", async () => {
    const { token, keyring } = await issued();
    const journal = new InMemoryHandoffExecutionJournalV1();
    const river = new RecordingRiver();
    const destination = new RecordingDestination();

    await expect(
      executeGovernedSiteHandoffV2({
        token: token.token,
        expectedDestination: "VSR",
        signatureVerifier: keyring,
        wardenVerifier: new StaticWardenVerifier(grant()),
        journal,
        river,
        destination,
        postDeploymentVerifier: new ExactSessionVerifier(true),
        nowMs: NOW + 1_000,
      }),
    ).rejects.toThrow("destination_session_mismatch");

    expect(destination.calls).toBe(1);
    expect(river.calls.some((call) => call.startsWith("seal-exception:"))).toBe(true);
    await expect(
      executeGovernedSiteHandoffV2({
        token: token.token,
        expectedDestination: "VSR",
        signatureVerifier: keyring,
        wardenVerifier: new StaticWardenVerifier(grant()),
        journal,
        river,
        destination,
        postDeploymentVerifier: new ExactSessionVerifier(),
        nowMs: NOW + 2_000,
      }),
    ).rejects.toThrow("handoff_prior_attempt_failed");
    expect(destination.calls).toBe(1);
  });

  it("cannot extend a token beyond the Warden grant validity window", async () => {
    const shortGrant = grant({ validUntil: "2026-08-15T07:00:30.000Z" });
    const verifier = new StaticWardenVerifier(shortGrant);
    const keyring = new InMemoryHmacHandoffKeyringV1("HANDOFF-KEY:001", SECRET);
    const token = await issueGovernedHandoffGrantV2(
      {
        issuer: "ALPHA-HANDOFF-ISSUER-001",
        actorRef: "DIGITALME-ALPHA-001",
        digitalMeRef: "DIGITALME-ALPHA-001",
        sourceSite: "BC",
        destinationSite: "VSR",
        capabilities: ["program:read"],
        wardenGrantRef: shortGrant.grantRef,
        ttlSeconds: 120,
        nowMs: NOW,
      },
      { wardenVerifier: verifier, signer: keyring },
    );

    expect(token.claims.exp * 1000).toBe(Date.parse(shortGrant.validUntil));
  });

  it("rejects capability escalation beyond the Warden grant", async () => {
    const verifier = new StaticWardenVerifier(grant({ capabilityRefs: ["program:read"] }));
    const keyring = new InMemoryHmacHandoffKeyringV1("HANDOFF-KEY:001", SECRET);
    await expect(
      issueGovernedHandoffGrantV2(
        {
          issuer: "ALPHA-HANDOFF-ISSUER-001",
          actorRef: "DIGITALME-ALPHA-001",
          digitalMeRef: "DIGITALME-ALPHA-001",
          sourceSite: "BC",
          destinationSite: "VSR",
          capabilities: ["program:read", "evidence:submit"],
          wardenGrantRef: "WARDEN-GRANT:HANDOFF-001",
          nowMs: NOW,
        },
        { wardenVerifier: verifier, signer: keyring },
      ),
    ).rejects.toThrow("handoff_warden_capability_denied:evidence:submit");
  });

  it("detects nonce conflicts in the execution journal", async () => {
    const journal = new InMemoryHandoffExecutionJournalV1();
    const start = {
      nonce: "NONCE-001",
      handoffRef: "HANDOFF:001",
      tokenDigest: "sha256:first",
      expiresAtMs: NOW + 60_000,
      startedAtMs: NOW,
    };
    expect(await journal.begin(start)).toEqual({ state: "STARTED" });
    expect(await journal.begin({ ...start, tokenDigest: "sha256:other" })).toEqual({
      state: "CONFLICT",
    });
  });
});
