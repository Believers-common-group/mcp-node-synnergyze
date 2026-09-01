import { z } from "zod";

import type { CustomMcpServer } from "../CustomMcpServer.ts";
import { isToolAllowed, type ToolFilter } from "../toolFilters.ts";
import { CongressGovClientV1 } from "../../modules/legislative-intelligence/adapters/congress-gov/client.ts";
import { WindowsDpapiCongressGovCredentialProviderV1 } from "../../modules/legislative-intelligence/adapters/congress-gov/credential-provider.ts";
import { CongressGovSourceAdapterV1 } from "../../modules/legislative-intelligence/adapters/congress-gov/source-adapter.ts";
import type { LegislativeIntelligenceResultStoreV1 } from "../../modules/legislative-intelligence/result-store.ts";
import { LegislativeIntelligenceServiceV1 } from "../../modules/legislative-intelligence/service.ts";

export const operationId = "pestel_legislative_ingest";
export const enableEnvironmentVariable = "VSR_PESTEL_MCP_R0_1";
export const description =
  "Read official Congress.gov bill evidence, normalize lifecycle state, classify six PESTEL dimensions, and create bounded review candidates. This tool does not authorize consequential action.";

const inputSchema = z
  .object({
    congress: z.number().int().positive(),
    billType: z.string().min(1).max(12),
    number: z.number().int().positive(),
    registryIndex: z
      .array(
        z
          .object({
            registryEntityRef: z.string().min(1),
            terms: z.array(z.string().min(1)),
          })
          .strict(),
      )
      .default([]),
  })
  .strict();

export type PestelLegislativeIngestInputV1 = z.infer<typeof inputSchema>;
export type PestelLegislativeIngestClockV1 = () => string;

export function createDefaultPestelLegislativeServiceV1(): LegislativeIntelligenceServiceV1 {
  const credentials = new WindowsDpapiCongressGovCredentialProviderV1();
  const client = new CongressGovClientV1(credentials);
  const source = new CongressGovSourceAdapterV1(client);
  return new LegislativeIntelligenceServiceV1(source);
}

export function registerPestelLegislativeIngest(
  server: CustomMcpServer,
  service: LegislativeIntelligenceServiceV1,
  store: LegislativeIntelligenceResultStoreV1,
  clock: PestelLegislativeIngestClockV1 = () => new Date().toISOString(),
): void {
  server.tool({
    name: operationId,
    description,
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["congress", "billType", "number"],
      properties: {
        congress: { type: "integer", minimum: 1 },
        billType: { type: "string", minLength: 1, maxLength: 12 },
        number: { type: "integer", minimum: 1 },
        registryIndex: {
          type: "array",
          default: [],
          items: {
            type: "object",
            additionalProperties: false,
            required: ["registryEntityRef", "terms"],
            properties: {
              registryEntityRef: { type: "string", minLength: 1 },
              terms: { type: "array", items: { type: "string", minLength: 1 } },
            },
          },
        },
      },
    },
    cb: async (args) => {
      const parsed = inputSchema.parse(args);
      const result = await service.ingestBill(
        {
          jurisdiction: "US-FEDERAL",
          objectType: "bill",
          congress: parsed.congress,
          billType: parsed.billType,
          number: parsed.number,
        },
        {
          observedAt: clock(),
          registryIndex: parsed.registryIndex,
        },
      );
      await store.put(result);

      return JSON.stringify({
        sourceReceiptRefs: [...result.event.sourceRefs],
        lifecycle: result.event.lifecycle,
        signalRef: result.signal.signalRef,
        evidenceRefs: [...new Set([result.evidence.evidenceRef, ...result.signal.evidenceRefs])].sort(),
        briefRef: result.brief.briefRef,
        registryCandidateRefs: result.registryCandidates.map((candidate) => candidate.candidateRef).sort(),
        workCandidate: result.workCandidate,
      });
    },
  });
}

export function maybeRegisterPestelLegislativeIngest(
  server: CustomMcpServer,
  filter: ToolFilter,
  service: LegislativeIntelligenceServiceV1,
  store: LegislativeIntelligenceResultStoreV1,
  env: NodeJS.ProcessEnv = process.env,
  clock: PestelLegislativeIngestClockV1 = () => new Date().toISOString(),
): boolean {
  if (env[enableEnvironmentVariable] !== "1") return false;
  if (!filter.allowedTools?.has(operationId)) return false;
  if (!isToolAllowed(operationId, filter)) return false;
  registerPestelLegislativeIngest(server, service, store, clock);
  return true;
}
