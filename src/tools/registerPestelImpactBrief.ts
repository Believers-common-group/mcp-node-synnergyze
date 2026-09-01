import { z } from "zod";

import type { CustomMcpServer } from "../CustomMcpServer.ts";
import { isToolAllowed, type ToolFilter } from "../toolFilters.ts";
import type { LegislativeIntelligenceResultStoreV1 } from "../../modules/legislative-intelligence/result-store.ts";

export const operationId = "pestel_impact_brief";
export const enableEnvironmentVariable = "VSR_PESTEL_MCP_R0_1";
export const description =
  "Return a previously ingested evidence-backed PESTEL impact brief and Registry impact candidates by signal reference. This tool performs no network request and does not trigger Warden.";

const inputSchema = z.object({ signalRef: z.string().min(1) }).strict();

export function registerPestelImpactBrief(
  server: CustomMcpServer,
  store: LegislativeIntelligenceResultStoreV1,
): void {
  server.tool({
    name: operationId,
    description,
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["signalRef"],
      properties: {
        signalRef: { type: "string", minLength: 1 },
      },
    },
    cb: async (args) => {
      const parsed = inputSchema.parse(args);
      const result = await store.getBySignalRef(parsed.signalRef);
      if (!result) throw new Error("SIGNAL_NOT_FOUND");
      return JSON.stringify({
        brief: result.brief,
        registryCandidates: result.registryCandidates,
      });
    },
  });
}

export function maybeRegisterPestelImpactBrief(
  server: CustomMcpServer,
  filter: ToolFilter,
  store: LegislativeIntelligenceResultStoreV1,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env[enableEnvironmentVariable] !== "1") return false;
  if (!filter.allowedTools?.has(operationId)) return false;
  if (!isToolAllowed(operationId, filter)) return false;
  registerPestelImpactBrief(server, store);
  return true;
}
