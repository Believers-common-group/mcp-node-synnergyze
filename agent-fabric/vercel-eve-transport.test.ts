import { describe, expect, it } from "vitest";

import { admitVercelEveSession } from "./vercel-eve-admission.js";

interface TransportResponse {
  status: "STARTED" | "BLOCKED";
  sessionId?: string;
  riverReceipt: {
    eventType: "EVE_SESSION_TRANSPORT_STARTED" | "EVE_SESSION_TRANSPORT_BLOCKED";
    wardenDecisionRef: string;
  };
}

interface EveTransportModule {
  startVercelEveSession(input: {
    admission: ReturnType<typeof admitVercelEveSession>;
    endpoint: string;
    message: string;
    oidcToken?: string;
    fetchImpl: typeof fetch;
    recordedAt: string;
  }): Promise<TransportResponse>;
}

async function loadImplementation(): Promise<EveTransportModule | undefined> {
  const specifier = "./vercel-eve-transport.js";
  try {
    return (await import(specifier)) as EveTransportModule;
  } catch {
    return undefined;
  }
}

describe("Vercel Eve transport boundary R0.2", () => {
  it("does not call Eve when Warden admission is denied", async () => {
    const implementation = await loadImplementation();
    expect(implementation, "Vercel Eve transport adapter must exist").toBeDefined();
    if (!implementation) return;

    const admission = admitVercelEveSession({
      requestRef: "EVE-REQ-TRANSPORT-DENY-001",
      requesterRef: "DIGITALME-001",
      representedEntityRef: "ENTITY-001",
      purpose: "bounded-durable-agent-session",
      requestedCapabilities: ["entity.profile.read"],
      wardenDecision: {
        decisionRef: "WARDEN-EVE-DENY-TRANSPORT-001",
        decision: "DENY",
        allowedCapabilities: [],
      },
      requestedAt: "2026-09-02T06:30:00.000Z",
    });

    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      return new Response(null, { status: 500 });
    };

    const result = await implementation.startVercelEveSession({
      admission,
      endpoint: "https://eve.example.test",
      message: "probe",
      fetchImpl,
      recordedAt: "2026-09-02T06:30:01.000Z",
    });

    expect(calls).toBe(0);
    expect(result.status).toBe("BLOCKED");
    expect(result.sessionId).toBeUndefined();
    expect(result.riverReceipt.eventType).toBe("EVE_SESSION_TRANSPORT_BLOCKED");
    expect(result.riverReceipt.wardenDecisionRef).toBe("WARDEN-EVE-DENY-TRANSPORT-001");
  });

  it("starts one Eve session only after Warden admission", async () => {
    const implementation = await loadImplementation();
    expect(implementation, "Vercel Eve transport adapter must exist").toBeDefined();
    if (!implementation) return;

    const admission = admitVercelEveSession({
      requestRef: "EVE-REQ-TRANSPORT-ALLOW-001",
      requesterRef: "DIGITALME-001",
      representedEntityRef: "ENTITY-001",
      purpose: "bounded-durable-agent-session",
      requestedCapabilities: ["entity.profile.read", "contract.execute"],
      wardenDecision: {
        decisionRef: "WARDEN-EVE-ALLOW-TRANSPORT-001",
        decision: "ALLOW",
        allowedCapabilities: ["entity.profile.read"],
      },
      requestedAt: "2026-09-02T06:31:00.000Z",
    });

    let calls = 0;
    let observedUrl = "";
    let observedInit: RequestInit | undefined;
    const fetchImpl: typeof fetch = async (input, init) => {
      calls += 1;
      observedUrl = String(input);
      observedInit = init;
      return new Response(null, {
        status: 200,
        headers: { "x-eve-session-id": "wrun_EVE_001" },
      });
    };

    const result = await implementation.startVercelEveSession({
      admission,
      endpoint: "https://eve.example.test/",
      message: "Verify governed durable execution.",
      oidcToken: "test-oidc-token",
      fetchImpl,
      recordedAt: "2026-09-02T06:31:01.000Z",
    });

    expect(calls).toBe(1);
    expect(observedUrl).toBe("https://eve.example.test/eve/v1/session");
    expect(observedInit?.method).toBe("POST");
    expect(observedInit?.headers).toEqual({
      "content-type": "application/json",
      "x-vercel-trusted-oidc-idp-token": "test-oidc-token",
    });
    expect(JSON.parse(String(observedInit?.body))).toEqual({
      message: "Verify governed durable execution.",
    });
    expect(result.status).toBe("STARTED");
    expect(result.sessionId).toBe("wrun_EVE_001");
    expect(result.riverReceipt.eventType).toBe("EVE_SESSION_TRANSPORT_STARTED");
    expect(result.riverReceipt.wardenDecisionRef).toBe("WARDEN-EVE-ALLOW-TRANSPORT-001");
  });
});
