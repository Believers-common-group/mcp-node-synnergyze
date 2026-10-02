import { describe, expect, it } from "vitest";
import { MemoryReplayStore } from "./runtime.ts";
import {
  completeGovernedHandoff, prepareGovernedHandoff,
  type HandoffNativePorts, type IssuanceReservation,
} from "./assurance.ts";

const secret = "0123456789abcdef0123456789abcdef";
const now = 2_000_000_000;
const base = {
  digitalMeId: "DIGITALME-SYNTH-001", sourceSite: "bc" as const,
  destinationSite: "cc" as const, returnUrl: "https://creators-common.org/",
  wardenGrantId: "WARDEN-SYNTH-001",
};

function harness() {
  const events: string[] = [];
  const reservations = new Map<string, IssuanceReservation>();
  let decision: "ALLOW" | "DENY" | "ESCALATE" = "ALLOW";
  let lifecycle: "ACTIVE" | "REVOKED" | "EXPIRED" = "ACTIVE";
  let badPrincipal = false;
  let badReservation = false;
  let failedSeal = false;
  let failedActivation = false;
  const ports: HandoffNativePorts = {
    principal: { async verify(id) { events.push("principal.verify"); return {
      digitalMeId: badPrincipal ? "OTHER" : id, status: "VERIFIED", proofRef: "DM-PROOF-001", expiresAt: now + 150,
    }; } },
    warden: { async verify(input) { events.push("warden.verify"); return {
      decision, lifecycle, action: "SITE_HANDOFF", grantId: input.grantId,
      digitalMeId: input.digitalMeId, sourceSite: input.sourceSite,
      destinationSite: input.destinationSite, decisionRef: "WD-DECISION-001", expiresAt: now + 150,
    }; } },
    river: {
      async reserve({ claims, wardenDecisionRef }) { events.push("river.reserve");
        const r: IssuanceReservation = {
          reservationRef: "RESERVE-SYNTH-001", state: badReservation ? "MISSING" : "RESERVED",
          nonce: claims.nonce, digitalMeId: claims.digital_me_id,
          audience: claims.audience, wardenDecisionRef,
        }; reservations.set(claims.nonce, r); return r;
      },
      async lookup(nonce) { events.push("river.lookup"); return reservations.get(nonce) ?? null; },
      async seal() { events.push("river.seal"); return {
        state: failedSeal ? "REJECTED" : "SEALED", evidenceRef: failedSeal ? "" : "RIVER-SYNTH-001",
      } as const; },
    },
    sessions: {
      async prepare() { events.push("session.prepare"); return { sessionRef: "SESSION-SYNTH-001", state: "PENDING" } as const; },
      async activate() { events.push("session.activate"); return {
        sessionRef: "SESSION-SYNTH-001", state: failedActivation ? "REVOKED" : "ACTIVE",
      } as const; },
      async abort() { events.push("session.abort"); },
    },
    replay: new MemoryReplayStore(), // synthetic test only; NOT production durable replay
  };
  return { ports, events, setDecision: (x: typeof decision) => decision=x,
    setLifecycle: (x: typeof lifecycle) => lifecycle=x,
    badPrincipal: () => badPrincipal=true, badReservation: () => badReservation=true,
    failSeal: () => failedSeal=true, failActivation: () => failedActivation=true,
  };
}

describe("R1 stage-only governed site handoff", () => {
  it("binds native principal and Warden proof before reserving and releasing token", async () => {
    const h = harness();
    const issued = await prepareGovernedHandoff(base, secret, h.ports, now);
    expect(issued.claims.audience).toBe("cc");
    expect(h.events).toEqual(["principal.verify", "warden.verify", "river.reserve"]);
    const completed = await completeGovernedHandoff(issued.token, "cc", secret, h.ports, now+1);
    expect(completed.evidenceRef).toBe("RIVER-SYNTH-001");
    expect(h.events.slice(3)).toEqual([
      "principal.verify", "warden.verify", "river.lookup", "session.prepare", "river.seal", "session.activate",
    ]);
    await expect(completeGovernedHandoff(issued.token, "cc", secret, h.ports, now+2))
      .rejects.toThrow("replay_detected");
  });
  it("denies issuance without verified DigitalMe", async () => {
    const h = harness(); h.badPrincipal();
    await expect(prepareGovernedHandoff(base, secret, h.ports, now)).rejects.toThrow("digitalme_proof_not_admitted");
    expect(h.events).toEqual(["principal.verify"]);
  });
  it("blocks denied and revoked Warden grants", async () => {
    const h = harness(); h.setDecision("DENY");
    await expect(prepareGovernedHandoff(base, secret, h.ports, now)).rejects.toThrow("warden_handoff_not_admitted");
    expect(h.events).not.toContain("river.reserve");
    const g = harness(); g.setLifecycle("REVOKED");
    await expect(prepareGovernedHandoff(base, secret, g.ports, now)).rejects.toThrow("warden_handoff_not_admitted");
  });
  it("does not release token on unbound reservation", async () => {
    const h = harness(); h.badReservation();
    await expect(prepareGovernedHandoff(base, secret, h.ports, now)).rejects.toThrow("river_reservation_unbound");
  });
  it("aborts pending session and prevents activation if River seal fails", async () => {
    const h = harness(); const issued = await prepareGovernedHandoff(base, secret, h.ports, now);
    h.failSeal();
    await expect(completeGovernedHandoff(issued.token, "cc", secret, h.ports, now+1))
      .rejects.toThrow("river_seal_not_verified");
    expect(h.events).toContain("session.abort");
    expect(h.events).not.toContain("session.activate");
  });
  it("rejects wrong destination before obtaining a session", async () => {
    const h = harness(); const issued = await prepareGovernedHandoff(base, secret, h.ports, now);
    await expect(completeGovernedHandoff(issued.token, "vsr", secret, h.ports, now+1))
      .rejects.toThrow("audience_mismatch");
    expect(h.events).not.toContain("session.prepare");
  });
  it("revokes failed post-seal activation and surfaces reconciliation need", async () => {
    const h = harness(); const issued = await prepareGovernedHandoff(base, secret, h.ports, now);
    h.failActivation();
    await expect(completeGovernedHandoff(issued.token, "cc", secret, h.ports, now+1))
      .rejects.toThrow("scoped_session_not_active");
    expect(h.events).toContain("session.abort");
  });
});
