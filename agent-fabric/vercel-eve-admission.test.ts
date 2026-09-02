import { describe, expect, it } from "vitest";

interface AdmissionResult {
  status: "ADMITTED" | "DENIED";
  eveSessionRequest?: {
    capabilities: readonly string[];
  };
  riverReceipt: {
    eventType: "EVE_SESSION_ADMISSION_ACCEPTED" | "EVE_SESSION_ADMISSION_DENIED";
    wardenDecisionRef: string;
  };
}

interface EveAdmissionModule {
  admitVercelEveSession(input: {
    requestRef: string;
    requesterRef: string;
    representedEntityRef: string;
    purpose: string;
    requestedCapabilities: readonly string[];
    wardenDecision: {
      decisionRef: string;
      decision: "ALLOW" | "DENY";
      allowedCapabilities: readonly string[];
    };
    requestedAt: string;
  }): AdmissionResult;
}

async function loadImplementation(): Promise<EveAdmissionModule | undefined> {
  const specifier = "./vercel-eve-admission.js";
  try {
    return (await import(specifier)) as EveAdmissionModule;
  } catch {
    return undefined;
  }
}

describe("Vercel Eve admission boundary R0.1", () => {
  it("requires Warden ALLOW before creating an Eve session", async () => {
    const implementation = await loadImplementation();

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
    const implementation = await loadImplementation();

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
