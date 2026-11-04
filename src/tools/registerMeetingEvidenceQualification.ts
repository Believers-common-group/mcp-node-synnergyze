import type { CustomMcpServer } from "../CustomMcpServer.ts";
import { isToolAllowed, type ToolFilter } from "../toolFilters.ts";
import { qualifyMeetingMetadataR05 } from "../../modules/meeting/qualifier.ts";

export const operationId = "synnergyzeMeetingQualifyMetadataR05";
export const enableEnvironmentVariable = "VSR_MEETING_MCP_OFFLINE_QUALIFICATION";
export const description =
  "OFFLINE R0.5: inspect caller-supplied synthetic booking/audio metadata. No provider reads, Warden authorization, calendar writes, media reads, River receipts, booking verification, or persistence.";

export function registerMeetingEvidenceQualification(server: CustomMcpServer): void {
  server.tool({
    name: operationId,
    description,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    // The inner object is left unmodified so the pure qualifier DENIES unknown
    // keys rather than AJV deleting them (CustomMcpServer uses removeAdditional).
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["input"],
      properties: { input: { type: "object" } },
    },
    cb: async (args) => JSON.stringify(qualifyMeetingMetadataR05(
      (args as { input?: unknown }).input,
    )),
  });
}

/** BOTH explicit opt-ins are needed. An all-tools allowlist does not enable this. */
export function maybeRegisterMeetingEvidenceQualification(
  server: CustomMcpServer,
  filter: ToolFilter,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env[enableEnvironmentVariable] !== "1") return false;
  if (!filter.allowedTools?.has(operationId)) return false;
  if (!isToolAllowed(operationId, filter)) return false;
  registerMeetingEvidenceQualification(server);
  return true;
}
