import { describe, expect, it } from "vitest";

import { consumeHandoffGrant, issueHandoffGrant, type ReplayStore } from "./runtime.ts";

const secret = "0123456789abcdef0123456789abcdef";

class TestReplayStore implements ReplayStore {
  private readonly seen = new Set<string>();

  async consumeOnce(nonce: string): Promise<boolean> {
    if (this.seen.has(nonce)) return false;
    this.seen.add(nonce);
    return true;
  }
}

describe("REG-SITE-HANDOFF-001", () => {
  it("issues an audience-bound short-lived Warden handoff", async () => {
    const now = 2_000_000_000;
    const { token, claims } = issueHandoffGrant(
      {
        digitalMeId: "DIGITALME-TEST-001",
        sourceSite: "bc",
        destinationSite: "vsr",
        returnUrl: "https://virtualsilkroad.com/join",
        wardenGrantId: "WARDEN-GRANT-TEST-001",
      },
      secret,
      now,
    );

    expect(claims.issuer).toBe("WARDEN");
    expect(claims.expires_at - claims.issued_at).toBe(90);
    const consumed = await consumeHandoffGrant(token, "vsr", secret, new TestReplayStore(), now + 1);
    expect(consumed.digital_me_id).toBe("DIGITALME-TEST-001");
  });

  it("rejects audience substitution", async () => {
    const now = 2_000_000_000;
    const { token } = issueHandoffGrant(
      {
        digitalMeId: "DIGITALME-TEST-001",
        sourceSite: "bc",
        destinationSite: "cc",
        returnUrl: "https://creators-common.org/",
        wardenGrantId: "WARDEN-GRANT-TEST-001",
      },
      secret,
      now,
    );
    await expect(consumeHandoffGrant(token, "vsr", secret, new TestReplayStore(), now + 1)).rejects.toThrow(
      "audience_mismatch",
    );
  });

  it("rejects replay", async () => {
    const now = 2_000_000_000;
    const store = new TestReplayStore();
    const { token } = issueHandoffGrant(
      {
        digitalMeId: "DIGITALME-TEST-001",
        sourceSite: "cc",
        destinationSite: "bc",
        returnUrl: "https://believerscommon.com/",
        wardenGrantId: "WARDEN-GRANT-TEST-001",
      },
      secret,
      now,
    );
    await consumeHandoffGrant(token, "bc", secret, store, now + 1);
    await expect(consumeHandoffGrant(token, "bc", secret, store, now + 2)).rejects.toThrow("replay_detected");
  });

  it("rejects open redirects and overlong grants", () => {
    expect(() =>
      issueHandoffGrant(
        {
          digitalMeId: "DIGITALME-TEST-001",
          sourceSite: "bc",
          destinationSite: "cc",
          returnUrl: "https://attacker.example/steal",
          wardenGrantId: "WARDEN-GRANT-TEST-001",
        },
        secret,
      ),
    ).toThrow("invalid_return_url");

    expect(() =>
      issueHandoffGrant(
        {
          digitalMeId: "DIGITALME-TEST-001",
          sourceSite: "bc",
          destinationSite: "cc",
          returnUrl: "https://creators-common.org/",
          wardenGrantId: "WARDEN-GRANT-TEST-001",
          ttlSeconds: 600,
        },
        secret,
      ),
    ).toThrow("invalid_ttl");
  });

  it("requires an actual Warden grant reference", () => {
    expect(() =>
      issueHandoffGrant(
        {
          digitalMeId: "DIGITALME-TEST-001",
          sourceSite: "bc",
          destinationSite: "vsr",
          returnUrl: "https://virtualsilkroad.com/",
          wardenGrantId: "",
        },
        secret,
      ),
    ).toThrow("warden_grant_required");
  });
});
