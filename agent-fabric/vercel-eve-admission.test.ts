import { describe, expect, it } from "vitest";

describe("Vercel Eve admission boundary R0.1", () => {
  it("requires Warden ALLOW before creating an Eve session", async () => {
    let implementation: typeof import("./vercel-eve-admission.js") | undefined;

    try {
      implementation = await import("./vercel-eve-admission.js");
    } catch {
      implementation = undefined;
    }

    expect(implementation, "Vercel Eve admission adapter must exist").toBeDefined();
    if (!implementation) return;

    const result = implementation.admitVercelEveSession({
      requestRef: "EVE-REQ-001",
      requesterRef: "DIGITALME-001",
      representedEntityRef: "ENTITY-001",
      purpose: "bounded-durable-agent-session",
      requestedCapabilities: ["entity.profile.read"],
      wardenDecision: {
        decisionRef: "WARDEN-EVE-DENY-001",
        decision: "DENY",
        allowedCapabilities: [],
      },
      requestedAt: "2026-09-02T06:00:00.000Z",
    });

    expect(result.status).toBe("DENIED");
    expect(result.eveSessionRequest).toBeUndefined();
    expect(result.riverReceipt.eventType).toBe("EVE_SESSION_ADMISSION_DENIED");
  });

  it("projects only Warden-authorized capabilities into the Eve session request", async () => {
    let implementation: typeof import("./vercel-eve-admission.js") | undefined;

    try {
      implementation = await import("./vercel-eve-admission.js");
    } catch {
      implementation = undefined;
    }

    expect(implementation, "Vercel Eve admission adapter must exist").toBeDefined();
    if (!implementation) return;

    const result = implementation.admitVercelEveSession({
      requestRef: "EVE-REQ-002",
      requesterRef: "DIGITALME-001",
      representedEntityRef: "ENTITY-001",
      purpose: "bounded-durable-agent-session",
      requestedCapabilities: ["entity.profile.read", "contract.execute"],
      wardenDecision: {
        decisionRef: "WARDEN-EVE-ALLOW-001",
        decision: "ALLOW",
        allowedCapabilities: ["entity.profile.read"],
      },
      requestedAt: "2026-09-02T06:01:00.000Z",
    });

    expect(result.status).toBe("ADMITTED");
    expect(result.eveSessionRequest?.capabilities).toEqual(["entity.profile.read"]);
    expect(result.eveSessionRequest?.capabilities).not.toContain("contract.execute");
    expect(result.riverReceipt.eventType).toBe("EVE_SESSION_ADMISSION_ACCEPTED");
    expect(result.riverReceipt.wardenDecisionRef).toBe("WARDEN-EVE-ALLOW-001");
  });
});
