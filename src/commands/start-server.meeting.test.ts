import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { CallToolResultSchema, ListToolsResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, describe, expect, it } from "vitest";

import { createServer } from "./start-server.ts";
import {
  operationId,
  enableEnvironmentVariable,
} from "../tools/registerMeetingEvidenceQualification.ts";

const originalEnableValue = process.env[enableEnvironmentVariable];
afterEach(() => {
  if (originalEnableValue === undefined) {
    delete process.env[enableEnvironmentVariable];
  } else {
    process.env[enableEnvironmentVariable] = originalEnableValue;
  }
});

async function listedToolNames(allowTools?: string[]) {
  const server = await createServer({
    allowTools,
    credentials: {
      applicationId: "MEETING-OFFLINE-NO-REMOTE",
      apiKey: "MEETING-OFFLINE-NO-REMOTE",
    },
  });
  const client = new Client({ name: "meeting-assembly-test", version: "0.5.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  try {
    const listed = await client.request({ method: "tools/list" }, ListToolsResultSchema);
    return listed.tools.map((tool) => tool.name);
  } finally {
    await Promise.all([client.close(), server.close()]);
  }
}

describe("SYN-MEETING-CONCIERGE-001 R0.5 MCP server assembly", () => {
  it("does not expose the Meeting tool with only allow-tools", async () => {
    delete process.env[enableEnvironmentVariable];
    await expect(listedToolNames([operationId])).resolves.not.toContain(operationId);
  });
  it("does not expose the Meeting tool with only env opt-in", async () => {
    process.env[enableEnvironmentVariable] = "1";
    await expect(listedToolNames()).resolves.not.toContain(operationId);
  });
  it("exposes the Meeting tool with BOTH explicit opt-ins", async () => {
    process.env[enableEnvironmentVariable] = "1";
    await expect(listedToolNames([operationId])).resolves.toEqual([operationId]);
  });
  it("denies untrusted metadata through the actual MCP protocol without echoing it", async () => {
    process.env[enableEnvironmentVariable] = "1";
    const server = await createServer({
      allowTools: [operationId],
      credentials: {
        applicationId: "MEETING-OFFLINE-NO-REMOTE",
        apiKey: "MEETING-OFFLINE-NO-REMOTE",
      },
    });
    const client = new Client({ name: "meeting-call-test", version: "0.5.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
    try {
      const secret = "SYNTHETIC_PRIVATE_AUDIO_SHOULD_NOT_LEAK";
      const response = await client.request({
        method: "tools/call",
        params: {
          name: operationId,
          arguments: {
            input: {
              meetingRef: "SYN-LAB-MTG-001",
              principalRef: "DIGITALME-LAB-001",
              purpose: "schedule_evidence",
              expectedEventUid: "uid-001",
              observation: {
                provider: "calendar",
                capability: "event.read",
                status: "ok",
                meetingRef: "SYN-LAB-MTG-001",
                sourceMeetingRef: "SYN-LAB-MTG-001",
                sourceRef: "TEST-CALENDAR-001",
                observedAt: "2026-11-04T10:56:00+05:30",
                transport: "fixture_injected",
                paginationComplete: true,
                ownerScopeReviewed: true,
                metadata: {
                  eventUid: "uid-001",
                  calendarEventRef: "evt-001",
                  organizerDomain: "lab.example",
                  start: "2026-11-05T10:00:00+05:30",
                  end: "2026-11-05T11:00:00+05:30",
                  calendarStatus: "confirmed",
                  audio: secret,
                },
              },
            },
          },
        },
      }, CallToolResultSchema);
      const textItem = response.content[0];
      if (!textItem || textItem.type !== "text") throw new Error("MCP_TEXT_RESULT_EXPECTED");
      const result = JSON.parse(textItem.text) as { status: string; reasonCodes: string[]; mediaRead: boolean };
      expect(result.status).toBe("DENIED");
      expect(result.reasonCodes).toContain("UNEXPECTED_METADATA_FIELD");
      expect(result.mediaRead).toBe(false);
      expect(JSON.stringify(response)).not.toContain(secret);
    } finally {
      await Promise.all([client.close(), server.close()]);
    }
  });

});
