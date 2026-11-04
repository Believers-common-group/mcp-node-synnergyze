import { describe, expect, it, vi } from "vitest";
import type { CustomMcpServer } from "../CustomMcpServer.ts";
import type { ToolFilter } from "../toolFilters.ts";
import {
  maybeRegisterMeetingEvidenceQualification,
  operationId,
  enableEnvironmentVariable,
} from "./registerMeetingEvidenceQualification.ts";

const fakeServer = () => ({ tool: vi.fn() });
const filter = (allow: boolean): ToolFilter => ({ allowedTools: allow ? new Set([operationId]) : undefined });

describe("SYN-MEETING-CONCIERGE-001 R0.5 MCP opt-in", () => {
  it("does not register with allow-tools entry alone", () => {
    const server = fakeServer();
    expect(maybeRegisterMeetingEvidenceQualification(
      server as unknown as CustomMcpServer, filter(true), {},
    )).toBe(false);
    expect(server.tool).not.toHaveBeenCalled();
  });
  it("does not register with env flag alone", () => {
    const server = fakeServer();
    expect(maybeRegisterMeetingEvidenceQualification(
      server as unknown as CustomMcpServer, filter(false), { [enableEnvironmentVariable]: "1" },
    )).toBe(false);
    expect(server.tool).not.toHaveBeenCalled();
  });
  it("registers exactly one read-only, closed-world tool with BOTH", () => {
    const server = fakeServer();
    expect(maybeRegisterMeetingEvidenceQualification(
      server as unknown as CustomMcpServer, filter(true), { [enableEnvironmentVariable]: "1" },
    )).toBe(true);
    expect(server.tool).toHaveBeenCalledTimes(1);
    const tool = server.tool.mock.calls[0][0];
    expect(tool.name).toBe(operationId);
    expect(tool.annotations.readOnlyHint).toBe(true);
    expect(tool.annotations.openWorldHint).toBe(false);
  });
});
